import assert from "node:assert/strict";
import test from "node:test";

import { collectorCanWrite, collectorStatusView, requestCollectorStatus, requestSnapshot, requestTelemetrySmokeTest, retryAfterMs } from "./transport.js";

const config = { token: "secret", deviceId: "fixture" };
const response = (status, body, retryAfter) => ({ ok: status < 300, status, json: async () => body, headers: { get: () => retryAfter } });
test("bounded network, 429 and 5xx retries preserve identical request bytes", async () => {
  const sent = [], sleeps = [];
  const results = [new Error("network secret"), response(429, {}, "2"), response(503, {}), response(200, { ok: true })];
  await requestSnapshot("https://example.invalid", config, "partitions", { runId: "fixed" }, {
    fetchImpl: async (_, options) => { sent.push(options.body); const r = results.shift(); if (r instanceof Error) throw r; return r; },
    sleep: async (ms) => sleeps.push(ms), random: () => 0,
  });
  assert.equal(new Set(sent).size, 1);
  assert.deepEqual(sleeps, [500, 2000, 2000]);
});
test("Retry-After dates, malformed values and excessive server waits", async () => {
  assert.equal(retryAfterMs("Thu, 01 Jan 1970 00:00:05 GMT", 1000), 4000);
  assert.equal(retryAfterMs("garbage"), 0);
  await assert.rejects(requestSnapshot("https://example.invalid", config, "begin", {}, {
    fetchImpl: async () => response(429, {}, "120"), sleep: async () => assert.fail("must not retry early"),
  }), /after 120 seconds/);
});
test("only completion cleanup conflict is retryable among 4xx responses", async () => {
  for (const [status, error, operation, count] of [[401, "unauthorized", "begin", 1], [403, "forbidden", "begin", 1], [400, "invalid_snapshot", "partitions", 1], [409, "snapshot_conflict", "partitions", 1], [409, "snapshot_run_incomplete", "complete", 5], [409, "SNAPSHOT_RUN_INCOMPLETE", "complete", 5], [409, "snapshot_run_incomplete", "partitions", 1]]) {
    let calls = 0;
    await assert.rejects(requestSnapshot("https://example.invalid", config, operation, {}, {
      fetchImpl: async () => { calls++; return response(status, { error }); }, sleep: async () => {},
    }), /failed/);
    assert.equal(calls, count);
  }
});
test("exhausted network and malformed success responses never claim success", async () => {
  for (const network of [true, false]) {
    let calls = 0;
    await assert.rejects(requestSnapshot("https://example.invalid", config, "complete", {}, {
      fetchImpl: async () => { calls++; if (network) throw new Error("secret"); return response(200, {}); }, sleep: async () => {},
    }), network ? /network connection/ : /invalid_response/);
    assert.equal(calls, 5);
  }
});

const token = `umx_${"a".repeat(64)}`;
const deviceId = "01234567-89ab-4cde-8fab-0123456789ab";

test("collector status sends the credential only as a bearer header", async () => {
  let request;
  const result = await requestCollectorStatus("https://usagemax.com/api/v1/devices/status", { token, deviceId }, {
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({
        status: "active",
        credentialType: "collector",
        writeOnly: true,
        activation: "not_required",
        expiresAt: null,
        scopes: ["telemetry:write"],
        scopeStatus: "valid",
        ingestAuthorized: true,
        deviceBinding: "matched",
        profileHandle: `relay-${token}`,
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  assert.equal(request.url, "https://usagemax.com/api/v1/devices/status");
  assert.equal(request.options.method, "GET");
  assert.equal(request.options.headers.authorization, `Bearer ${token}`);
  assert.equal(request.options.headers["x-usagemax-device-id"], deviceId);
  assert.equal(new URL(request.url).search, "");
  assert.equal(result.httpStatus, 200);
  const view = collectorStatusView(result.httpStatus, result.body, token);
  assert.equal(view.status, "active");
  assert.equal(view.scopeStatus, "valid");
  assert.equal(view.ingestAuthorized, true);
  assert.equal(JSON.stringify(view).includes(token), false);
  assert.equal(view.profileHandle, "relay-[redacted]");
  assert.equal("keyHash" in view, false);
});

test("collector status reduces an unknown credential to a safe rejection", () => {
  const view = collectorStatusView(401, { error: "unauthorized", token }, token);
  assert.equal(view.status, "rejected");
  assert.equal(view.tokenFormat, "valid");
  assert.equal(JSON.stringify(view).includes(token), false);
  assert.equal("error" in view, false);
});

test("collector status keeps a safe installation mismatch diagnostic", () => {
  const view = collectorStatusView(409, {
    ok: false,
    status: "device_mismatch",
    credentialType: "collector",
    writeOnly: true,
    activation: "not_required",
    expiresAt: null,
    scopes: ["telemetry:write"],
    scopeStatus: "valid",
    ingestAuthorized: false,
    deviceBinding: "mismatch",
    profileHandle: "relay",
    deviceName: "HUD relay",
  }, token);
  assert.equal(view.status, "device_mismatch");
  assert.equal(view.httpStatus, 409);
  assert.equal(view.deviceBinding, "mismatch");
  assert.equal(view.ingestAuthorized, false);
});

test("credential checks fail unless UsageMax confirms active write authorization", () => {
  const active = { httpStatus: 200, status: "active", credentialType: "collector", scopeStatus: "valid", ingestAuthorized: true, deviceBinding: "matched" };
  assert.equal(collectorCanWrite(active), true);
  for (const change of [
    { httpStatus: 401 }, { status: "revoked" }, { credentialType: "other" },
    { scopeStatus: "missing_telemetry_write" }, { ingestAuthorized: false }, { deviceBinding: "mismatch" },
  ]) assert.equal(collectorCanWrite({ ...active, ...change }), false);
});

test("telemetry smoke test sends one strict, zero-accounting observability event", async () => {
  const token = `umx_${"a".repeat(64)}`;
  let request;
  const result = await requestTelemetrySmokeTest("https://usagemax.com/api/v1/telemetry/llm", {
    token, deviceId,
  }, {
    eventId: "fixed-id",
    now: () => 1_789_000_000_000,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ ok: true, accepted: 1, conflicts: 0, duplicates: 0, replay: false }), { status: 202 });
    },
  });
  const payload = JSON.parse(request.options.body);
  const event = payload.events[0];
  const allowed = new Set(["eventKey", "eventType", "provider", "model", "source", "agentName", "status", "state", "occurredAt", "inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens", "reasoningTokens", "totalTokens", "costMicros", "costBasis", "completeness", "accountingMode", "schemaVersion"]);
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers.authorization, `Bearer ${token}`);
  assert.equal(request.options.headers["x-usagemax-device-id"], deviceId);
  assert.equal(request.options.headers["idempotency-key"], `usagemax-cli:${deviceId}:fixed-id`);
  assert.equal(payload.events.length, 1);
  assert.ok(Object.keys(event).every((field) => allowed.has(field)));
  assert.equal(event.eventType, "agent_state");
  assert.equal(event.accountingMode, "observability");
  assert.equal(event.totalTokens, 0);
  assert.equal(event.costMicros, 0);
  assert.deepEqual(result, { ok: true, status: "accepted", httpStatus: 202, accepted: 1, duplicates: 0, replay: false, observabilityOnly: true, accountingUpdated: false });
  assert.equal(JSON.stringify(result).includes(token), false);
});

test("telemetry smoke test reports safe rejection and network results", async () => {
  const config = { token: `umx_${"a".repeat(64)}`, deviceId };
  const rejected = await requestTelemetrySmokeTest("https://usagemax.com/api/v1/telemetry/llm", config, {
    fetchImpl: async () => new Response(JSON.stringify({ error: "unauthorized", token: config.token }), { status: 401 }),
  });
  assert.equal(rejected.status, "unauthorized");
  assert.equal(JSON.stringify(rejected).includes(config.token), false);
  const offline = await requestTelemetrySmokeTest("https://usagemax.com/api/v1/telemetry/llm", config, {
    fetchImpl: async () => { throw new Error(config.token); },
  });
  assert.deepEqual(offline, { ok: false, status: "unavailable", httpStatus: null });
});
