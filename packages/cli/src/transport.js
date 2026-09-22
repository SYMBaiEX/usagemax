import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

export function retryAfterMs(value, now = Date.now()) {
  if (value == null || value === "") return 0;
  if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value) * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : 0;
}

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}

const collectorStates = new Set(["active", "revoked", "workspace_disabled", "membership_inactive", "device_mismatch", "scope_missing"]);
const deviceBindings = new Set(["unbound", "bound", "matched", "mismatch"]);
const collectorTokenPattern = /umx_[a-f0-9]{64}/gi;

export function collectorCanWrite(view) {
  return view?.httpStatus === 200
    && view?.status === "active"
    && view?.credentialType === "collector"
    && view?.scopeStatus === "valid"
    && view?.ingestAuthorized === true
    && view?.deviceBinding !== "mismatch";
}

function safeText(value, secret) {
  let text = value;
  if (secret) text = text.split(secret).join("[redacted]");
  return text.replace(collectorTokenPattern, "[redacted]").slice(0, 160);
}

// Only copy the documented diagnostic projection. This keeps a compromised or
// misconfigured endpoint from echoing a collector secret through the CLI.
export function collectorStatusView(httpStatus, value, secret) {
  const body = record(value);
  const view = { tokenFormat: "valid", httpStatus };
  if (!body) {
    return {
      ...view,
      status: httpStatus === 401 ? "rejected" : "unavailable",
      reason: httpStatus === 401
        ? "UsageMax did not accept this collector token. It may be unknown, revoked, disabled, or from another deployment."
        : "UsageMax returned no machine-readable collector status.",
    };
  }

  if (typeof body.status === "string" && collectorStates.has(body.status)) view.status = body.status;
  if (body.credentialType === "collector") view.credentialType = body.credentialType;
  if (body.writeOnly === true) view.writeOnly = true;
  if (body.activation === "not_required") view.activation = body.activation;
  if (body.expiresAt === null) view.expiresAt = null;
  if (Array.isArray(body.scopes)) view.scopes = body.scopes.filter((scope) => typeof scope === "string").slice(0, 16);
  if (body.scopeStatus === "valid" || body.scopeStatus === "missing_telemetry_write") view.scopeStatus = body.scopeStatus;
  if (typeof body.ingestAuthorized === "boolean") view.ingestAuthorized = body.ingestAuthorized;
  if (typeof body.deviceBinding === "string" && deviceBindings.has(body.deviceBinding)) view.deviceBinding = body.deviceBinding;
  for (const key of ["profileHandle", "deviceName", "platform", "cliVersion", "lastFailureCode"]) {
    if (typeof body[key] === "string") view[key] = safeText(body[key], secret);
  }
  for (const key of ["createdAt", "lastSeenAt", "lastSuccessAt", "lastFailureAt"]) {
    if (typeof body[key] === "number" && Number.isSafeInteger(body[key])) view[key] = body[key];
    else if (body[key] === null) view[key] = null;
  }
  if (!view.status) {
    view.status = httpStatus === 401 ? "rejected" : "unavailable";
    view.reason = httpStatus === 401
      ? "UsageMax did not accept this collector token. It may be unknown, revoked, disabled, or from another deployment."
      : "UsageMax returned an incomplete collector status.";
  }
  return view;
}

export async function requestCollectorStatus(endpoint, config, {
  timeout = 15_000,
  fetchImpl = fetch,
} = {}) {
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: "GET",
      headers: {
        authorization: `Bearer ${config.token}`,
        ...(config.deviceId ? { "x-usagemax-device-id": config.deviceId } : {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(timeout),
    });
  } catch {
    throw new Error("Collector status could not reach UsageMax or timed out. Check your network connection.");
  }
  const body = await response.json().catch(() => null);
  return { httpStatus: response.status, body };
}

/** Send one zero-token observability event to prove the authenticated write path. */
export async function requestTelemetrySmokeTest(endpoint, config, {
  timeout = 15_000,
  fetchImpl = fetch,
  now = Date.now,
  eventId = randomUUID(),
} = {}) {
  const eventKey = `usagemax-cli-test:${eventId}`;
  const event = {
    eventKey,
    eventType: "agent_state",
    provider: "usagemax-cli",
    model: "usagemax-connectivity-check",
    source: "usagemax-cli",
    agentName: "UsageMax CLI",
    status: "ok",
    state: "connected",
    occurredAt: now(),
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    costMicros: 0,
    costBasis: "unknown",
    completeness: "unknown",
    accountingMode: "observability",
    schemaVersion: 1,
  };
  const body = JSON.stringify({ events: [event] });
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
        "x-usagemax-device-id": config.deviceId,
        "idempotency-key": `usagemax-cli:${config.deviceId}:${eventId}`,
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(timeout),
    });
  } catch {
    return { ok: false, status: "unavailable", httpStatus: null };
  }
  const result = record(await response.json().catch(() => null));
  const ok = response.ok && result?.ok === true;
  return {
    ok,
    status: ok ? "accepted" : response.status === 401 ? "unauthorized"
      : response.status === 403 ? "forbidden"
        : response.status === 409 ? "device_or_idempotency_conflict"
          : response.status === 429 ? "rate_limited"
            : response.status >= 500 ? "unavailable" : "rejected",
    httpStatus: response.status,
    ...(Number.isSafeInteger(result?.accepted) ? { accepted: result.accepted } : {}),
    ...(Number.isSafeInteger(result?.duplicates) ? { duplicates: result.duplicates } : {}),
    ...(typeof result?.replay === "boolean" ? { replay: result.replay } : {}),
    observabilityOnly: true,
    accountingUpdated: false,
  };
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
