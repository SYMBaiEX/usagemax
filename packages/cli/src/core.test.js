import assert from "node:assert/strict";
import test from "node:test";

import { batchId, buildDeltaPlan, normalizeLinkCode, sourceSummary, validHttpsUrl } from "./core.js";

const report = {
  daily: [{
    agent: "codex",
    period: "2026-09-14",
    totalCost: 0.75,
    modelBreakdowns: [{
      modelName: "gpt-5.6",
      inputTokens: 100,
      outputTokens: 40,
      cacheCreationTokens: 10,
      cacheReadTokens: 50,
      cost: 0.75,
    }],
  }],
};

test("validates one-use link code and secure endpoints", () => {
  assert.equal(normalizeLinkCode("umx-abcd-efgh-jkmn-pqrs"), "UMX-ABCD-EFGH-JKMN-PQRS");
  assert.equal(normalizeLinkCode("bad-code"), null);
  assert.ok(validHttpsUrl("https://example.com/v1/link"));
  assert.equal(validHttpsUrl("http://example.com/v1/link"), null);
  assert.ok(validHttpsUrl("http://localhost:3210/v1/link", { allowLocalhost: true }));
});

test("creates additive, idempotent usage deltas without content fields", () => {
  const first = buildDeltaPlan(report, {}, "device-1", "ccusage@20.0.20");
  assert.equal(first.plan.length, 1);
  assert.deepEqual(first.plan[0].event, {
    eventKey: first.plan[0].event.eventKey,
    agentId: "device-1:codex",
    agentName: "codex",
    eventType: "model_request",
    source: "codex",
    provider: "openai",
    model: "gpt-5.6",
    inputTokens: 100,
    outputTokens: 40,
    cacheReadTokens: 50,
    cacheWriteTokens: 10,
    totalTokens: 200,
    costMicros: 750000,
    costBasis: "estimated",
    pricingSource: "ccusage / LiteLLM",
    pricingVersion: "ccusage@20.0.20",
    status: "ok",
    state: "synced",
    occurredAt: "2026-09-14T12:00:00.000Z",
    completeness: "estimated",
  });
  assert.equal("prompt" in first.plan[0].event, false);
  const snapshots = { [first.plan[0].snapshotKey]: first.plan[0].snapshot };
  assert.equal(buildDeltaPlan(report, snapshots, "device-1").plan.length, 0);
  assert.equal(batchId("device-1", first.plan.map((item) => item.event)), batchId("device-1", first.plan.map((item) => item.event)));
});

test("reports detected local sources", () => {
  assert.deepEqual(sourceSummary({ daily: [{ agent: "codex" }, { agent: "claude" }, { agent: "codex" }] }), ["claude", "codex"]);
});

test("splits ccusage unified totals into their real agents", () => {
  const unified = {
    daily: [{
      agent: "all",
      period: "2026-09-14",
      totalTokens: 350,
      agents: [
        {
          agent: "codex",
          modelBreakdowns: [{
            modelName: "gpt-5.6",
            inputTokens: 100,
            outputTokens: 40,
            cacheCreationTokens: 10,
            cacheReadTokens: 50,
            cost: 0.75,
          }],
        },
        {
          agent: "claude",
          modelBreakdowns: [{
            modelName: "claude-sonnet-4-5",
            inputTokens: 80,
            outputTokens: 20,
            cacheCreationTokens: 0,
            cacheReadTokens: 50,
            cost: 0.5,
          }],
        },
      ],
    }],
  };
  const result = buildDeltaPlan(unified, {}, "device-1");
  assert.deepEqual(sourceSummary(unified), ["claude", "codex"]);
  assert.equal(result.plan.length, 2);
  assert.deepEqual(result.plan.map((item) => item.event.source).sort(), ["claude", "codex"]);
  assert.equal(result.plan.some((item) => item.event.source === "all"), false);
});

test("preserves ccusage totals that cannot be assigned to a model bucket", () => {
  const result = buildDeltaPlan({
    daily: [{
      agent: "droid",
      period: "2026-09-14",
      totalTokens: 150,
      totalCost: 0.25,
      modelBreakdowns: [{
        modelName: "gpt-5",
        inputTokens: 60,
        outputTokens: 20,
        cacheCreationTokens: 0,
        cacheReadTokens: 20,
        cost: 0.2,
      }],
    }],
  }, {}, "device-1");
  assert.equal(result.plan.length, 2);
  assert.equal(result.plan.reduce((sum, item) => sum + item.event.totalTokens, 0), 150);
  assert.equal(result.plan.reduce((sum, item) => sum + item.event.costMicros, 0), 250_000);
  assert.equal(result.plan.find((item) => item.event.model === "unattributed")?.event.totalTokens, 50);
});

test("classifies prefixed and bracketed model providers without changing model identity", () => {
  const fixture = {
    daily: [{
      agent: "all",
      period: "2026-09-14",
      agents: [
        { agent: "pi", modelBreakdowns: [{ modelName: "[pi] gpt-5", inputTokens: 1 }] },
        { agent: "openclaw", modelBreakdowns: [{ modelName: "[openclaw] qwen3-coder", inputTokens: 1 }] },
        { agent: "opencode", modelBreakdowns: [{ modelName: "openrouter/anthropic/claude-opus-5", inputTokens: 1 }] },
        { agent: "kimi", modelBreakdowns: [{ modelName: "kimi-k2.5", inputTokens: 1 }] },
      ],
    }],
  };
  const events = buildDeltaPlan(fixture, {}, "device-1").plan.map((item) => item.event);
  assert.equal(events.find((event) => event.model === "[pi] gpt-5")?.provider, "openai");
  assert.equal(events.find((event) => event.model === "[openclaw] qwen3-coder")?.provider, "alibaba");
  assert.equal(events.find((event) => event.model.startsWith("openrouter/"))?.provider, "openrouter");
  assert.equal(events.find((event) => event.model === "kimi-k2.5")?.provider, "moonshot");
});
