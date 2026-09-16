import assert from "node:assert/strict";
import test from "node:test";

import { collectorStatusView, requestCollectorStatus, requestSnapshot, retryAfterMs } from "./transport.js";

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
        deviceBinding: "matched",
        profileHandle: "builder",
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  assert.equal(request.url, "https://usagemax.com/api/v1/devices/status");
  assert.equal(request.options.method, "GET");
  assert.equal(request.options.headers.authorization, `Bearer ${token}`);
  assert.equal(request.options.headers["x-usagemax-device-id"], deviceId);
  assert.equal(new URL(request.url).search, "");
  assert.equal(result.httpStatus, 200);
  const view = collectorStatusView(result.httpStatus, result.body);
  assert.equal(view.status, "active");
  assert.equal(JSON.stringify(view).includes(token), false);
  assert.equal("keyHash" in view, false);
});

test("collector status reduces an unknown credential to a safe rejection", () => {
  const view = collectorStatusView(401, { error: "unauthorized", token });
  assert.equal(view.status, "rejected");
  assert.equal(view.tokenFormat, "valid");
  assert.equal(JSON.stringify(view).includes(token), false);
  assert.equal("error" in view, false);
});
