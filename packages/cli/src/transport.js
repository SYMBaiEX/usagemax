import { setTimeout as delay } from "node:timers/promises";

export function retryAfterMs(value, now = Date.now()) {
  if (value == null || value === "") return 0;
  if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value) * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : 0;
}

// Only snapshot operations have server receipts. Never automatically replay a
// one-use link request or apply this policy to arbitrary POST operations.
export async function requestSnapshot(endpoint, config, operation, payload, {
  timeout = 30_000, attempts = 5, maxDelayMs = 60_000,
  fetchImpl = fetch, sleep = delay, random = Math.random, now = Date.now,
} = {}) {
  const body = JSON.stringify({ operation, ...payload });
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let response;
    let result;
    let failure;
    let retryable = true;
    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json", "x-usagemax-device-id": config.deviceId },
        body,
        signal: AbortSignal.timeout(timeout),
      });
      result = await response.json().catch(() => null);
      if (response.ok && result?.ok === true) return result;
      retryable = response.ok || response.status === 429 || response.status >= 500
        || (operation === "complete" && response.status === 409
          && String(result?.error).toLowerCase() === "snapshot_run_incomplete");
      const code = typeof result?.error === "string" ? result.error.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) : "invalid_response";
      const advice = response.status === 401 ? " Link this computer again."
        : response.status === 403 ? " Check workspace membership and collector permissions."
        : response.status === 409 ? " The saved run needs reconciliation; do not delete its checkpoint or repeatedly start new runs."
        : response.status === 400 ? " Check CLI/server protocol compatibility."
        : "";
      failure = new Error(`Snapshot ${operation} failed (HTTP ${response.status}: ${code}).${advice}`);
      failure.code = code;
    } catch {
      failure = new Error(`Snapshot ${operation} could not reach UsageMax or timed out. Check your network connection.`);
    }
    if (!retryable || attempt + 1 >= attempts) throw failure;
    const retryAfter = retryAfterMs(response?.headers?.get("retry-after"), now());
    // Never retry earlier than the server's requested interval. Long backoffs
    // remain durably resumable instead of blocking the command indefinitely.
    if (retryAfter > maxDelayMs) throw new Error(`${failure.message} Server requested a longer wait; retry sync after ${Math.ceil(retryAfter / 1000)} seconds.`);
    const jitter = Math.min(maxDelayMs, 1000 * 2 ** attempt) * (0.5 + random() * 0.5);
    await sleep(Math.max(retryAfter, jitter));
  }
  throw new Error("Snapshot retry budget is empty.");
}
