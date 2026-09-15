import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { batchId, buildDeltaPlan, buildSessionPlan, buildSnapshotPlan, normalizeLinkCode, sourceSummary, validHttpsUrl } from "./core.js";

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

test("builds authoritative partitions for decreases, deletions, and provider identity", () => {
  const first = buildSnapshotPlan(report, {}, { bootstrap: true, full: true, runId: "run-1", revision: 1 });
  assert.equal(first.partitions.length, 1);
  assert.equal("snapshotKey" in first.partitions[0].rows[0], false);
  assert.equal(
    first.partitions[0].payloadHash,
    createHash("sha256").update(JSON.stringify({
      source: first.partitions[0].source,
      day: first.partitions[0].day,
      complete: first.partitions[0].complete,
      pricingVersion: first.partitions[0].pricingVersion,
      rows: first.partitions[0].rows,
    })).digest("hex"),
  );
  const previous = first.nextSnapshots;
  const changed = structuredClone(report);
  changed.daily[0].modelBreakdowns[0].inputTokens = 80;
  changed.daily[0].modelBreakdowns[0].cost = 0.5;
  const second = buildSnapshotPlan(changed, previous, { full: true, runId: "run-2", revision: 2 });
  assert.equal(second.regressions.length, 1);
  const corrected = second.partitions[0].rows.find((row) => row.model === "gpt-5.6");
  assert.equal(corrected.previous.inputTokens, 100);
  assert.equal(corrected.current.inputTokens, 80);
  assert.equal(corrected.provider, "openai");

  const removed = buildSnapshotPlan({ daily: [] }, previous, { full: true, runId: "run-3", revision: 3 });
  assert.equal(removed.partitions.length, 1);
  assert.equal(removed.partitions[0].rows[0].current.totalTokens, 0);
});

test("uploads only opaque session identities", () => {
  const sessions = buildSessionPlan({ session: [{ agent: "codex", period: "/private/project/session.jsonl", metadata: { lastActivity: "2026-09-14T12:00:00.000Z" } }] }, "device-1");
  assert.equal(sessions.length, 1);
  assert.match(sessions[0].sessionKey, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(sessions).includes("/private/project"), false);
});
