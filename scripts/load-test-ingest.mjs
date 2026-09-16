import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { buildSnapshotPlan } from "../packages/cli/src/core.js";
import { requestSnapshot } from "../packages/cli/src/transport.js";

// Dedicated staging credentials only; never discover secrets or default to production.
const endpoint = process.env.USAGEMAX_LOADTEST_URL;
const mode = process.env.USAGEMAX_LOADTEST_MODE ?? "snapshots";
const requests = Number(process.env.USAGEMAX_LOADTEST_REQUESTS ?? 20);
const concurrency = Number(process.env.USAGEMAX_LOADTEST_CONCURRENCY ?? 2);
if (!Number.isInteger(requests) || requests < 1 || requests > 5000 || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 25) throw new Error("Requests must be 1–5000; concurrency 1–25.");
if (!["snapshots", "telemetry"].includes(mode)) throw new Error("Invalid workload mode.");
if (process.argv.includes("--dry-run")) {
  console.log(JSON.stringify({ dryRun: true, mode, scenarios: requests, concurrency, modelsPerSnapshot: 101, networkRequestsSent: 0 }));
  process.exit(0);
}
const url = new URL(endpoint || "https://invalid.invalid");
if (!endpoint || url.protocol !== "https:" || url.username || url.password || url.search || url.hash
  || url.hostname === "usagemax.com" || url.hostname.endsWith(".usagemax.com")
  || process.env.USAGEMAX_LOADTEST_CONFIRM !== "staging"
  || process.env.USAGEMAX_LOADTEST_ALLOWED_ORIGIN !== url.origin) {
  throw new Error("Explicit staging URL, matching ALLOWED_ORIGIN and CONFIRM=staging required; production domains prohibited.");
}
const credentials = process.env.USAGEMAX_LOADTEST_CREDENTIALS_FILE
  ? JSON.parse(await readFile(process.env.USAGEMAX_LOADTEST_CREDENTIALS_FILE, "utf8"))
  : [{ token: process.env.USAGEMAX_LOADTEST_TOKEN, deviceId: process.env.USAGEMAX_LOADTEST_DEVICE_ID }];
if (!Array.isArray(credentials) || !credentials.length || credentials.length > 5000
  || credentials.some(c => !/^umx_[a-f0-9]{64}$/.test(c.token ?? "") || !/^[a-zA-Z0-9_-]{16,100}$/.test(c.deviceId ?? ""))) throw new Error("Supply dedicated staging token/deviceId pairs.");

const startedAt = Date.now(), campaign = randomUUID(), day = new Date().toISOString().slice(0, 10);
let next = 0, completed = 0, failed = 0;
const latencies = [], scenarioLatencies = [], statuses = new Map();
async function measuredFetch(target, options) {
  const started = Date.now();
  try {
    const response = await fetch(target, { ...options, redirect: "error" });
    statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
    return response;
  } catch {
    statuses.set("network_error", (statuses.get("network_error") ?? 0) + 1);
    throw new Error("Staging network request failed");
  } finally { latencies.push(Date.now() - started); }
}
async function worker() {
  while (next < requests) {
    const index = next++, config = credentials[index % credentials.length], started = Date.now();
    try {
      const runId = campaign + ":" + index;
      if (mode === "snapshots") {
        const { partitions } = buildSnapshotPlan({ daily: [{ agent: "loadtest-" + index, period: day,
          modelBreakdowns: Array.from({ length: 101 }, (_, i) => ({ modelName: "synthetic-" + i, inputTokens: 1 })) }] }, {},
          { full: true, bootstrap: true, complete: true, runId, revision: startedAt + index });
        const send = (operation, payload) => requestSnapshot(endpoint, config, operation, payload, { fetchImpl: measuredFetch });
        await send("begin", { runId, mode: "full", partitionCount: partitions.length, sourceCount: 1, inventoryComplete: true, inventoryErrors: 0, inventoryTruncated: false });
        await send("partitions", { runId, partitions });
        await send("partitions", { runId, partitions });
        await send("complete", { runId });
        await send("complete", { runId });
      } else {
        const response = await measuredFetch(endpoint, {
          method: "POST", signal: AbortSignal.timeout(30_000),
          headers: { authorization: "Bearer " + config.token, "content-type": "application/json", "x-usagemax-device-id": config.deviceId, "idempotency-key": runId },
          body: JSON.stringify({ events: [{ eventKey: runId, eventType: "agent_state", accountingMode: "observability", source: "loadtest", provider: "synthetic", model: "capacity-probe", status: "ok", state: "testing", occurredAt: new Date().toISOString() }] }),
        });
        await response.arrayBuffer();
        if (!response.ok) throw new Error("Staging telemetry rejected");
      }
      completed++;
    } catch { failed++; }
    finally { scenarioLatencies.push(Date.now() - started); }
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
const summary = values => {
  values.sort((a, b) => a - b);
  const p = n => values[Math.min(values.length - 1, Math.floor(values.length * n))] ?? 0;
  return { p50: p(.5), p95: p(.95), p99: p(.99), max: values.at(-1) ?? 0 };
};
console.log(JSON.stringify({ mode, campaign, scenarios: requests, collectors: credentials.length, concurrency, completed, failed,
  durationMs: Date.now() - startedAt, statuses: Object.fromEntries(statuses), httpLatencyMs: summary(latencies), scenarioLatencyMs: summary(scenarioLatencies),
  expectedAddedTokensForSuccessfulScenarios: mode === "snapshots" ? completed * 101 : 0, accountingVerified: false,
  note: "Reconcile staging totals and inspect OCC/queue/subscription metrics independently; responses are not capacity certification." }, null, 2));
process.exitCode = failed ? 1 : 0;
