import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { batchId, buildDeltaPlan, buildSessionPlan, buildSnapshotPlan, normalizeLinkCode, scanPolicy, sourceSummary, validHttpsUrl } from "./core.js";

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
  const first = buildDeltaPlan(report, {}, "device-1", "ccusage@20.0.24");
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
    pricingVersion: "ccusage@20.0.24",
    status: "ok",
    state: "synced",
    occurredAt: "2026-09-14T00:00:00.000Z",
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

test("keeps current OpenAI and Anthropic model IDs separate in deltas and snapshots", () => {
  const models = [
    ...["gpt-6-luna", "gpt-6-sol", "gpt-6-astra"].map((modelName) => ({ agent: "codex", modelName, provider: "openai" })),
    ...[
      "claude-fable-5",
      "claude-mythos-5",
      "claude-opus-5",
      "claude-opus-4-8",
      "claude-opus-4-7",
      "claude-sonnet-5",
      "claude-sonnet-4-6",
    ].map((modelName) => ({ agent: "claude", modelName, provider: "anthropic" })),
  ];
  const fixture = {
    daily: [{
      agent: "all",
      period: "2026-09-22",
      agents: ["codex", "claude"].map((agent) => ({
        agent,
        modelBreakdowns: models.filter((item) => item.agent === agent).map(({ modelName }) => ({
          modelName,
          inputTokens: 11,
          outputTokens: 7,
          cacheCreationTokens: 3,
          cacheReadTokens: 5,
          cost: 0.0001,
        })),
      })),
    }],
  };

  const events = buildDeltaPlan(fixture, {}, "device-1").plan.map((item) => item.event);
  assert.deepEqual(events.map(({ model }) => model).sort(), models.map(({ modelName }) => modelName).sort());
  for (const { modelName, provider } of models) {
    assert.equal(events.find((event) => event.model === modelName)?.provider, provider, modelName);
  }

  const snapshots = buildSnapshotPlan(fixture, {}, { full: true });
  const snapshotRows = snapshots.partitions.flatMap((partition) => partition.rows);
  assert.deepEqual(snapshotRows.map(({ model }) => model).sort(), models.map(({ modelName }) => modelName).sort());
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
      chunkIndex: 0,
      chunkCount: 1,
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

test("daily snapshot timestamps never land later in the current UTC day", () => {
  const morning = Date.parse("2026-09-15T04:00:00.000Z");
  const fixture = structuredClone(report);
  fixture.daily[0].period = "2026-09-15";
  const { partitions } = buildSnapshotPlan(fixture, {}, { revision: morning });
  assert.ok(partitions[0].rows.length > 0);
  for (const row of partitions[0].rows) {
    assert.equal(row.lastUsedAt, Date.parse("2026-09-15T00:00:00.000Z"));
    assert.ok(row.lastUsedAt <= morning);
  }
});

test("uploads only opaque session identities", () => {
  const sessions = buildSessionPlan({ session: [{ agent: "codex", period: "/private/project/session.jsonl", metadata: { lastActivity: "2026-09-14T12:00:00.000Z" } }] }, "device-1");
  assert.equal(sessions.length, 1);
  assert.match(sessions[0].sessionKey, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(sessions).includes("/private/project"), false);
});

test("incomplete missing sources and explicit zeros cannot erase checkpoints", () => {
  const first = buildSnapshotPlan(report, {}, { full: true });
  for (const fixture of [{ daily: [] }, { daily: [{ agent: "codex", period: "2026-09-14", modelBreakdowns: [{ modelName: "gpt-5.6", inputTokens: 0 }] }] }]) {
    const next = buildSnapshotPlan(fixture, first.nextSnapshots, { complete: false, full: true });
    assert.deepEqual(next.nextSnapshots, first.nextSnapshots);
    for (const partition of next.partitions) {
      assert.equal(partition.complete, false);
      for (const row of partition.rows) assert.deepEqual(row.current, row.previous);
    }
  }
});

test("incomplete per-dimension regression retains whole vector through resume and recovery", () => {
  const first = buildSnapshotPlan(report, {}, { full: true });
  const partial = structuredClone(report);
  partial.daily[0].modelBreakdowns[0].inputTokens = 99;
  partial.daily[0].modelBreakdowns[0].outputTokens = 1000;
  const second = buildSnapshotPlan(partial, first.nextSnapshots, { complete: false, full: true });
  assert.equal(second.regressions.length, 1);
  assert.deepEqual(second.nextSnapshots, first.nextSnapshots);
  assert.deepEqual(second.partitions[0].rows[0].current, second.partitions[0].rows[0].previous);
  const recovered = buildSnapshotPlan(report, second.nextSnapshots, { complete: false });
  assert.equal(recovered.partitions.length, 0);
  const corrected = buildSnapshotPlan(partial, second.nextSnapshots, { complete: true });
  assert.equal(corrected.partitions[0].rows[0].current.inputTokens, 99);
});

test("incremental scan preserves old checkpoints for subsequent authoritative deletion", () => {
  const full = structuredClone(report);
  full.daily.push({ ...structuredClone(report.daily[0]), period: "2026-09-15" });
  const first = buildSnapshotPlan(full, {}, { full: true });
  const today = { daily: [full.daily[1]] };
  const incremental = buildSnapshotPlan(today, first.nextSnapshots);
  assert.deepEqual(incremental.nextSnapshots, first.nextSnapshots);
  const later = buildSnapshotPlan(today, incremental.nextSnapshots, { full: true });
  assert.equal(later.partitions.find((p) => p.day === "2026-09-14").rows[0].current.totalTokens, 0);
  assert.equal(Object.keys(later.nextSnapshots).length, 1);
});

test("every independent counter regression protects its checkpoint vector", () => {
  const first = buildSnapshotPlan(report, {}, { full: true });
  const key = Object.keys(first.nextSnapshots)[0];
  for (const field of ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens", "reasoningTokens", "unclassifiedTokens", "costMicros", "requests", "errors"]) {
    const prior = structuredClone(first.nextSnapshots);
    prior[key][field] += 10;
    if (field.endsWith("Tokens")) prior[key].totalTokens += 10;
    const next = buildSnapshotPlan(report, prior, { complete: false, full: true });
    assert.deepEqual(next.nextSnapshots[key], prior[key], field);
    assert.deepEqual(next.partitions[0].rows.find((r) => r.model === "gpt-5.6").current, prior[key], field);
  }
});

test("large partitions have ordered bounded chunks and stable receipts", () => {
  const fixture = { daily: [{ agent: "codex", period: "2026-09-15", modelBreakdowns: Array.from({ length: 201 }, (_, i) => ({ modelName: `gpt-${i}`, inputTokens: 1 })) }] };
  const opts = { full: true, runId: "fixed-run", revision: 123 };
  const first = buildSnapshotPlan(fixture, {}, opts);
  assert.deepEqual(first, buildSnapshotPlan(fixture, {}, opts));
  assert.deepEqual(first.partitions.map((p) => p.rows.length), [100, 100, 1]);
  assert.deepEqual(first.partitions.map((p) => p.chunkIndex), [0, 1, 2]);
  assert.equal(new Set(first.partitions.map((p) => p.partitionId)).size, 3);
  assert.equal(new Set(first.partitions.flatMap((p) => p.rows.map((r) => r.model))).size, 201);
  for (const p of first.partitions) {
    assert.equal(p.chunkCount, 3);
    const { source, day, complete, pricingVersion, chunkIndex, chunkCount, rows } = p;
    assert.equal(p.payloadHash, createHash("sha256").update(JSON.stringify({ source, day, complete, pricingVersion, chunkIndex, chunkCount, rows })).digest("hex"));
  }
});

test("repeated partial scans can no-op without bootstrapping or claiming deletion authority", () => {
  const config = { snapshotProtocolVersion: 2, sourceInventoryVersion: 3, knownSources: ["codex"], lastFullSyncAt: "2026-09-15T00:00:00Z", lastReconciledDay: "2026-09-15", lastSyncComplete: false, lastScanSucceeded: true, lastCoverage: "partial", sourceFingerprint: "same" };
  const inventory = { sources: ["codex"], complete: true, errors: 0, truncated: false, fingerprint: "same" };
  const options = { today: "2026-09-15", now: Date.parse("2026-09-15T01:00:00Z"), inventoryVersion: 3 };
  assert.deepEqual(scanPolicy(config, inventory, options), { bootstrap: false, full: false, skip: true, inventoryStable: true });
  assert.equal(config.lastCoverage, "partial");
  for (const change of [{ lastScanSucceeded: false }, { sourceFingerprint: "changed" }, { lastReconciledDay: "2026-09-14" }, { pendingSync: { runId: "pending" } }]) {
    const policy = scanPolicy({ ...config, ...change }, inventory, options);
    assert.equal(policy.skip, false);
    assert.equal(policy.bootstrap, false);
    assert.equal(policy.full, false);
  }
  for (const change of [{ complete: false }, { errors: 1 }, { truncated: true }]) {
    assert.equal(scanPolicy(config, { ...inventory, ...change }, options).skip, false);
  }
  for (const change of [{ requestedFull: true }, { requestedArchives: true }, { now: Date.parse("2026-09-23T00:00:00Z") }, { inventoryVersion: 4 }]) {
    const policy = scanPolicy(config, inventory, { ...options, ...change });
    assert.equal(policy.full, true);
    assert.equal(policy.skip, false);
  }
  assert.equal(scanPolicy({ ...config, snapshotProtocolVersion: 1 }, inventory, options).bootstrap, true);
  assert.equal(scanPolicy(config, { ...inventory, sources: ["codex", "claude"] }, options).full, true);
  assert.equal(scanPolicy(config, inventory, { ...options, inventoryVersion: 4 }).full, true);
});
