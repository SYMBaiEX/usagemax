import { randomUUID } from "node:crypto";
import process from "node:process";

const endpoint = process.env.USAGEMAX_LOADTEST_URL;
const token = process.env.USAGEMAX_LOADTEST_TOKEN;
const requests = Math.min(5_000, Math.max(1, Number(process.env.USAGEMAX_LOADTEST_REQUESTS || 100)));
const concurrency = Math.min(25, Math.max(1, Number(process.env.USAGEMAX_LOADTEST_CONCURRENCY || 5)));

if (!endpoint || !token || !endpoint.startsWith("https://") || !token.startsWith("umx_")) {
  process.stderr.write("Set USAGEMAX_LOADTEST_URL and a dedicated USAGEMAX_LOADTEST_TOKEN. Never use a personal production collector.\n");
  process.exit(1);
}

const startedAt = Date.now();
let next = 0;
const latencies = [];
const statuses = new Map();

async function worker() {
  while (next < requests) {
    const index = next++;
    const requestStartedAt = Date.now();
    const eventKey = `loadtest:${startedAt}:${index}:${randomUUID()}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "idempotency-key": eventKey,
      },
      body: JSON.stringify({ events: [{
        eventKey,
        eventType: "agent_state",
        accountingMode: "observability",
        source: "loadtest",
        provider: "synthetic",
        model: "capacity-probe",
        status: "ok",
        state: "testing",
        occurredAt: new Date().toISOString(),
      }] }),
    });
    latencies.push(Date.now() - requestStartedAt);
    statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
latencies.sort((left, right) => left - right);
const percentile = (value) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * value))] ?? 0;
process.stdout.write(`${JSON.stringify({
  requests,
  concurrency,
  durationMs: Date.now() - startedAt,
  statuses: Object.fromEntries(statuses),
  latencyMs: { p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), max: latencies.at(-1) ?? 0 },
}, null, 2)}\n`);
