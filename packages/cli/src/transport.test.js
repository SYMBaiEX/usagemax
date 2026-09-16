import assert from "node:assert/strict";
import test from "node:test";
import { requestSnapshot, retryAfterMs } from "./transport.js";

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
