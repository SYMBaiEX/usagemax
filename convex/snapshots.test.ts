import { createHash } from "node:crypto";
import { beforeEach, describe, expect, test, vi } from "vitest";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";

import schema from "./schema";
import { api, internal } from "./_generated/api";
import { buildSnapshotPlan } from "../packages/cli/src/core.js";

const modules = import.meta.glob("./**/*.ts");
const token = `umx_${"a".repeat(64)}`;
const keyHash = createHash("sha256").update(token).digest("hex");

const counters = (totalTokens: number, costMicros = totalTokens * 10) => ({
  inputTokens: totalTokens,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  reasoningTokens: 0,
  unclassifiedTokens: 0,
  totalTokens,
  costMicros,
  requests: 0,
  errors: 0,
});
const rowForCoverage = (model: string, totalTokens: number, now: number) => ({
  provider: "openai",
  model,
  previous: counters(0),
  current: counters(totalTokens),
  costBasis: "estimated" as const,
  contentHash: model,
  lastUsedAt: now,
});

async function seed(t: ReturnType<typeof convexTest>, now: number) {
  return t.run(async (ctx) => {
    const workspaceId = await ctx.db.insert("workspaces", { slug: "snapshot", name: "Snapshot", plan: "free", isPublic: true, retentionDays: 30, createdAt: now });
    const profileId = await ctx.db.insert("profiles", { workspaceId, handle: "snapshot", displayName: "Snapshot", bio: "", isPublic: true, isVerified: false, verification: "collector", createdAt: now });
    await ctx.db.insert("profileStats", { workspaceId, profileId, totalTokens: 0, totalCostMicros: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, unclassifiedTokens: 0, sessions: 0, activeDays: 0, currentStreakDays: 0, longestStreakDays: 0, deviceCount: 0, topModel: "unknown", updatedAt: now });
    const collectorId = await ctx.db.insert("collectors", { workspaceId, profileId, name: "Snapshot collector", keyHash, keyPrefix: "umx_snap", scopes: ["telemetry:write"], createdAt: now });
    return { workspaceId, profileId, collectorId };
  });
}

describe("authoritative collector snapshots", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    t = convexTest(schema, modules);
    rateLimiterTest.register(t);
  });

  test("actual CLI chunk bytes are accepted through the HTTP contract before noon", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T06:00:00Z"));
    try {
      await seed(t, Date.now());
      const plan = buildSnapshotPlan({ daily: [{ agent: "codex", period: "2026-09-14", modelBreakdowns: Array.from({ length: 101 }, (_, i) => ({ modelName: `gpt-test-${i}`, inputTokens: 1 })) }] }, {}, { bootstrap: true, full: true, complete: false, runId: "wire", revision: Date.now() });
      const post = (payload: unknown) => t.fetch("/v2/usage/snapshots", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-usagemax-device-id": "01234567-89ab-4cde-8fab-0123456789ab" }, body: JSON.stringify(payload) });
      const started = await post({ operation: "begin", runId: "wire", mode: "full", partitionCount: plan.partitions.length, sourceCount: 1, inventoryComplete: false, inventoryErrors: 0, inventoryTruncated: false });
      expect(started.status).toBe(202);
      expect(started.headers.get("location")).toBe("https://usagemax.com/api/v2/usage/snapshots/wire");
      expect(await started.json()).toMatchObject({ ok: true, runId: "wire", statusUrl: "https://usagemax.com/api/v2/usage/snapshots/wire" });
      const committed = await post({ operation: "partitions", runId: "wire", partitions: plan.partitions });
      expect(await committed.json()).toMatchObject({ ok: true });
      expect((await post({ operation: "complete", runId: "wire" })).status).toBe(200);
      expect((await t.query(api.public.profile, { handle: "snapshot" }))?.stats?.totalTokens).toBe(101);
    } finally { vi.useRealTimers(); }
  });

  test("HTTP snapshot endpoint accepts bounded session and partition batches", async () => {
    const now = Date.UTC(2026, 8, 14, 12);
    await seed(t, now);
    const post = (payload: unknown) => t.fetch("/v2/usage/snapshots", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-usagemax-device-id": "01234567-89ab-4cde-8fab-0123456789ab" },
      body: JSON.stringify(payload),
    });
    const sessions = Array.from({ length: 250 }, (_, index) => ({ source: "codex", sessionKey: index.toString(16).padStart(64, "0") }));
    await post({ operation: "begin", runId: "sessions-250", mode: "incremental", partitionCount: 0, sourceCount: 1, inventoryComplete: true, inventoryErrors: 0, inventoryTruncated: false });
    const accepted = await post({ operation: "sessions", runId: "sessions-250", sessions });
    expect(accepted.status).toBe(202);
    expect(await accepted.json()).toMatchObject({ ok: true, accepted: 250, duplicates: 0 });
    expect((await post({ operation: "sessions", runId: "sessions-250", sessions: [...sessions, sessions[0]] })).status).toBe(400);
    expect((await post({ operation: "complete", runId: "sessions-250" })).status).toBe(200);

    const report = { daily: Array.from({ length: 20 }, (_, index) => ({
      agent: "codex",
      period: `2026-09-${String(index + 1).padStart(2, "0")}`,
      modelBreakdowns: [{ modelName: "gpt-test", inputTokens: 1 }],
    })) };
    const plan = buildSnapshotPlan(report, {}, { full: true, complete: false, runId: "partitions-20", revision: now });
    expect(plan.partitions).toHaveLength(20);
    await post({ operation: "begin", runId: "partitions-20", mode: "full", partitionCount: 20, sourceCount: 1, inventoryComplete: false, inventoryErrors: 0, inventoryTruncated: false });
    const committed = await post({ operation: "partitions", runId: "partitions-20", partitions: plan.partitions });
    expect(committed.status).toBe(202);
    expect(await committed.json()).toMatchObject({ ok: true, replays: 0 });
    expect((await post({ operation: "partitions", runId: "partitions-20", partitions: [...plan.partitions, plan.partitions[0]] })).status).toBe(400);
    expect((await post({ operation: "complete", runId: "partitions-20" })).status).toBe(200);
  });

  test("snapshot status is read-only, installation-bound, and does not bind an advanced key", async () => {
    const now = Date.UTC(2026, 8, 14, 12);
    await seed(t, now);
    const installationId = "01234567-89ab-4cde-8fab-0123456789ab";
    const installationIdHash = createHash("sha256").update(installationId).digest("hex");

    expect(await t.query(internal.snapshots.inspectRun, { keyHash, installationIdHash, runId: "not-started" })).toBeNull();
    expect(await t.run(async (ctx) => (await ctx.db.query("collectors").filter((q) => q.eq(q.field("keyHash"), keyHash)).unique())?.installationIdHash ?? null)).toBeNull();

    await t.mutation(internal.snapshots.beginRun, {
      keyHash,
      installationIdHash,
      runId: "status-run",
      mode: "full",
      sourceCount: 1,
      partitionCount: 2,
      inventoryComplete: true,
      inventoryErrors: 0,
      inventoryTruncated: false,
      now,
    });
    expect(await t.query(internal.snapshots.inspectRun, { keyHash, installationIdHash, runId: "status-run" })).toMatchObject({
      runId: "status-run",
      status: "uploading",
      sourceCount: 1,
      partitionCount: 2,
      acceptedPartitions: 0,
    });
    await expect(t.query(internal.snapshots.inspectRun, { keyHash, installationIdHash: "different-installation-hash", runId: "status-run" })).rejects.toThrow("DEVICE_ID_MISMATCH");
  });

  test("applies downward corrections and keeps provider identity", async () => {
    const now = Date.UTC(2026, 8, 14, 12);
    await seed(t, now);
    await t.mutation(internal.snapshots.beginRun, { keyHash, runId: "run-1", mode: "full", sourceCount: 1, partitionCount: 1, inventoryComplete: true, inventoryErrors: 0, inventoryTruncated: false, parserCoverageCertified: true, coverageStartDay: "2026-09-14", coverageEndDay: "2026-09-14", now });
    await t.mutation(internal.snapshots.commitPartition, {
      keyHash,
      runId: "run-1",
      partitionId: "run-1:codex:2026-09-14",
      payloadHash: "payload-1",
      revision: 1,
      source: "codex",
      day: "2026-09-14",
      complete: true,
      pricingVersion: "ccusage@test",
      rows: [
        { provider: "openai", model: "shared-model", previous: counters(0), current: counters(100), costBasis: "estimated", contentHash: "one", lastUsedAt: now },
        { provider: "openrouter", model: "shared-model", previous: counters(0), current: counters(50), costBasis: "estimated", contentHash: "two", lastUsedAt: now },
      ],
      now,
    });
    await t.mutation(internal.snapshots.completeRun, { keyHash, runId: "run-1", now });

    await t.mutation(internal.snapshots.beginRun, { keyHash, runId: "run-2", mode: "full", sourceCount: 1, partitionCount: 1, inventoryComplete: true, inventoryErrors: 0, inventoryTruncated: false, parserCoverageCertified: true, coverageStartDay: "2026-09-14", coverageEndDay: "2026-09-14", now: now + 1 });
    const correction = await t.mutation(internal.snapshots.commitPartition, {
      keyHash,
      runId: "run-2",
      partitionId: "run-2:codex:2026-09-14",
      payloadHash: "payload-2",
      revision: 2,
      source: "codex",
      day: "2026-09-14",
      complete: true,
      pricingVersion: "ccusage@test",
      rows: [{ provider: "openai", model: "shared-model", previous: counters(100), current: counters(80), costBasis: "estimated", contentHash: "three", lastUsedAt: now }],
      now: now + 1,
    });
    expect(correction.correctionRows).toBe(2);
    await t.mutation(internal.snapshots.completeRun, { keyHash, runId: "run-2", now: now + 1 });

    const profile = await t.query(api.public.profile, { handle: "snapshot" });
    expect(profile?.stats?.totalTokens).toBe(80);
    expect(profile?.models).toEqual([expect.objectContaining({ provider: "openai", model: "shared-model", totalTokens: 80 })]);
    const stored = await t.run(async (ctx) => ctx.db.query("collectorUsageSnapshots").collect());
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ provider: "openai", totalTokens: 80 });
  });

  test("counts opaque sessions once and replays partitions safely", async () => {
    const now = Date.UTC(2026, 8, 14, 12);
    await seed(t, now);
    await t.mutation(internal.snapshots.beginRun, { keyHash, runId: "session-run", mode: "incremental", sourceCount: 1, partitionCount: 1, inventoryComplete: true, inventoryErrors: 0, inventoryTruncated: false, now });
    const sessionArgs = { keyHash, runId: "session-run", sessions: [{ source: "claude", sessionKey: "a".repeat(64), lastActivityAt: now }], now };
    expect(await t.mutation(internal.snapshots.commitSessions, sessionArgs)).toMatchObject({ accepted: 1 });
    expect(await t.mutation(internal.snapshots.commitSessions, sessionArgs)).toMatchObject({ accepted: 0, duplicates: 1 });
    const partitionArgs = { keyHash, runId: "session-run", partitionId: "session-run:partition", payloadHash: "same", revision: 1, source: "claude", day: "2026-09-14", complete: true, rows: [{ provider: "anthropic", model: "claude-test", previous: counters(0), current: counters(20), costBasis: "estimated" as const, contentHash: "hash", lastUsedAt: now }], now };
    expect(await t.mutation(internal.snapshots.commitPartition, partitionArgs)).toMatchObject({ replay: false, changedRows: 1 });
    expect(await t.mutation(internal.snapshots.commitPartition, partitionArgs)).toMatchObject({ replay: true, changedRows: 1 });
    await t.mutation(internal.snapshots.completeRun, { keyHash, runId: "session-run", now });
    const profile = await t.query(api.public.profile, { handle: "snapshot" });
    expect(profile?.stats).toMatchObject({ sessions: 1, totalTokens: 20 });
  });

  test("adopts a legacy local baseline once without double-counting imported totals", async () => {
    const now = Date.UTC(2026, 8, 14, 12);
    const { profileId, collectorId } = await seed(t, now);
    await t.run(async (ctx) => {
      const stats = await ctx.db.query("profileStats").filter((q) => q.eq(q.field("profileId"), profileId)).unique();
      if (!stats) throw new Error("missing stats");
      await ctx.db.patch(stats._id, { totalTokens: 80, inputTokens: 80 });
    });
    const begun = await t.mutation(internal.snapshots.beginRun, {
      keyHash,
      runId: "legacy-baseline",
      mode: "full",
      requestedBaselineMode: "adopt-current",
      sourceCount: 1,
      partitionCount: 1,
      inventoryComplete: true,
      inventoryErrors: 0,
      inventoryTruncated: false,
      now,
    });
    expect(begun).toMatchObject({ baselineMode: "adopt-current" });
    const committed = await t.mutation(internal.snapshots.commitPartition, {
      keyHash,
      runId: "legacy-baseline",
      partitionId: "legacy-baseline:codex:2026-09-14",
      payloadHash: "legacy-payload",
      revision: 1,
      source: "codex",
      day: "2026-09-14",
      complete: true,
      rows: [{ provider: "openai", model: "gpt-test", previous: counters(100), current: counters(80), costBasis: "estimated", contentHash: "legacy", lastUsedAt: now }],
      now,
    });
    expect(committed).toMatchObject({ changedRows: 0, correctionRows: 0 });
    await t.mutation(internal.snapshots.completeRun, { keyHash, runId: "legacy-baseline", now });
    const state = await t.run(async (ctx) => ({
      collector: await ctx.db.get(collectorId),
      snapshots: await ctx.db.query("collectorUsageSnapshots").collect(),
      stats: await ctx.db.query("profileStats").filter((q) => q.eq(q.field("profileId"), profileId)).unique(),
    }));
    expect(state.collector).toMatchObject({ snapshotBaselineMode: "legacy_adopted", snapshotBaselineEstablishedAt: now });
    expect(state.snapshots).toEqual([expect.objectContaining({ totalTokens: 80 })]);
    expect(state.stats?.totalTokens).toBe(80);
    await t.mutation(internal.snapshots.beginRun, { keyHash, runId: "after-adoption", requestedBaselineMode: "adopt-current", mode: "full", sourceCount: 1, partitionCount: 1, inventoryComplete: true, inventoryErrors: 0, inventoryTruncated: false, now: now + 1 });
    await t.mutation(internal.snapshots.commitPartition, { keyHash, runId: "after-adoption", partitionId: "after-adoption:p", payloadHash: "after", revision: 2, source: "codex", day: "2026-09-14", complete: true, rows: [{ provider: "openai", model: "gpt-test", previous: counters(80), current: counters(100), costBasis: "estimated", contentHash: "after", lastUsedAt: now }], now: now + 1 });
    expect((await t.query(api.public.profile, { handle: "snapshot" }))?.stats?.totalTokens).toBe(100);
  });

  test("incomplete scans cannot decrease explicit rows or erase omitted models", async () => {
    const now = Date.UTC(2026, 8, 14, 12);
    await seed(t, now);
    const begin = { keyHash, mode: "full" as const, sourceCount: 1, partitionCount: 1, inventoryErrors: 0, inventoryTruncated: false, parserCoverageCertified: true, now };
    const row = (model: string, count: number) => ({ provider: "openai", model, previous: counters(0), current: counters(count), costBasis: "estimated" as const, contentHash: model, lastUsedAt: now });
    const part = { keyHash, revision: 1, source: "codex", day: "2026-09-14", complete: true, now };
    await t.mutation(internal.snapshots.beginRun, { ...begin, runId: "safe-one", inventoryComplete: true });
    await t.mutation(internal.snapshots.commitPartition, { ...part, runId: "safe-one", partitionId: "safe-one", payloadHash: "one", rows: [row("a", 100), row("b", 20)] });
    await t.mutation(internal.snapshots.completeRun, { keyHash, runId: "safe-one", now });
    await t.mutation(internal.snapshots.beginRun, { ...begin, runId: "safe-two", inventoryComplete: false });
    await t.mutation(internal.snapshots.commitPartition, { ...part, revision: 2, runId: "safe-two", partitionId: "safe-two", payloadHash: "two", rows: [row("a", 0)] });
    expect((await t.query(api.public.profile, { handle: "snapshot" }))?.stats?.totalTokens).toBe(120);
    expect(await t.run(ctx => ctx.db.query("collectorUsageSnapshots").collect())).toHaveLength(2);
  });

  test("inventory success without parser certification cannot correct or delete prior totals", async () => {
    const now = Date.UTC(2026, 8, 14, 12);
    const { collectorId } = await seed(t, now);
    const begin = { keyHash, mode: "full" as const, sourceCount: 1, partitionCount: 1, inventoryComplete: true, inventoryErrors: 0, inventoryTruncated: false, now };
    await t.mutation(internal.snapshots.beginRun, { ...begin, runId: "certified", parserCoverageCertified: true });
    await t.mutation(internal.snapshots.commitPartition, {
      keyHash, runId: "certified", partitionId: "certified:p", payloadHash: "certified", revision: 1,
      source: "codex", day: "2026-09-14", complete: true, rows: [rowForCoverage("kept", 100, now), rowForCoverage("also-kept", 20, now)], now,
    });
    await t.mutation(internal.snapshots.completeRun, { keyHash, runId: "certified", now });

    await t.mutation(internal.snapshots.beginRun, { ...begin, runId: "unverified", parserCoverageCertified: false, now: now + 1 });
    const correction = await t.mutation(internal.snapshots.commitPartition, {
      keyHash, runId: "unverified", partitionId: "unverified:p", payloadHash: "unverified", revision: 2,
      source: "codex", day: "2026-09-14", complete: true, rows: [rowForCoverage("kept", 80, now + 1)], now: now + 1,
    });
    expect(correction).toMatchObject({ correctionRows: 0 });
    const completed = await t.mutation(internal.snapshots.completeRun, { keyHash, runId: "unverified", now: now + 1 });
    expect(completed).toMatchObject({ coverageStatus: "unverified" });
    expect((await t.query(api.public.profile, { handle: "snapshot" }))?.stats?.totalTokens).toBe(120);
    expect(await t.run(ctx => ctx.db.query("collectorUsageSnapshots").collect())).toHaveLength(2);
    expect(await t.run(ctx => ctx.db.get(collectorId))).toMatchObject({ coverageStatus: "unverified", parserCoverageCertified: false });
  });

  test("enterprise summary refreshes coalesce without delaying accounting totals", async () => {
    vi.useFakeTimers();
    try {
      const now = Date.now();
      const { workspaceId } = await seed(t, now);
      await t.run(ctx => ctx.db.patch(workspaceId, { workosOrganizationId: "org-summary", plan: "enterprise" }));
      // This fixture collector is service-owned; no interactive member is claimed.
      for (let i = 1; i <= 3; i++) {
        await t.mutation(internal.snapshots.beginRun, { keyHash, runId: `summary-${i}`, mode: "full", sourceCount: 1, partitionCount: 1, inventoryComplete: true, inventoryErrors: 0, inventoryTruncated: false, now });
        await t.mutation(internal.snapshots.commitPartition, { keyHash, runId: `summary-${i}`, partitionId: `summary-${i}`, payloadHash: `sum-${i}`, source: "codex", day: "2026-09-14", revision: i, complete: true, rows: [{ provider: "openai", model: "gpt-test", previous: counters(i - 1), current: counters(i), costBasis: "estimated", contentHash: `h${i}`, lastUsedAt: now }], now });
        await t.mutation(internal.snapshots.completeRun, { keyHash, runId: `summary-${i}`, now });
      }
      expect((await t.query(api.public.profile, { handle: "snapshot" }))?.stats).toMatchObject({ totalTokens: 3, summaryScheduledAt: now });
      const scheduled = await t.run(ctx => ctx.db.system.query("_scheduled_functions").collect());
      expect(scheduled.filter(row => row.name === "snapshots:refreshSummary")).toHaveLength(1);
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const stats = (await t.query(api.public.profile, { handle: "snapshot" }))?.stats;
      expect(stats?.summaryScheduledAt).toBeUndefined();
      expect(stats?.topModel).toBe("gpt-test");
    } finally { vi.useRealTimers(); }
  });

  test("chunks preserve sibling models, block premature completion and clean omissions in bounded pages", async () => {
    vi.useFakeTimers();
    try {
      const now = Date.UTC(2026, 8, 14, 12);
      await seed(t, now);
      const rows = Array.from({ length: 201 }, (_, i) => ({ provider: "openai", model: `m${i}`, previous: counters(0), current: counters(1), costBasis: "estimated" as const, contentHash: `h${i}`, lastUsedAt: now }));
      const begin = { keyHash, mode: "full" as const, sourceCount: 1, inventoryComplete: true, inventoryErrors: 0, inventoryTruncated: false, parserCoverageCertified: true, now };
      await t.mutation(internal.snapshots.beginRun, { ...begin, runId: "chunks", partitionCount: 3 });
      const part = { keyHash, runId: "chunks", revision: 1, source: "codex", day: "2026-09-14", complete: true, chunkCount: 3, now };
      await expect(t.mutation(internal.snapshots.commitPartition, { ...part, chunkIndex: 1, partitionId: "bad-order", payloadHash: "bad", rows: rows.slice(100, 200) })).rejects.toThrow("SNAPSHOT_CHUNK_OUT_OF_ORDER");
      for (let i = 0; i < 3; i++) {
        const args = { ...part, chunkIndex: i, partitionId: `chunk${i}`, payloadHash: `hash${i}`, rows: rows.slice(i * 100, (i + 1) * 100) };
        await t.mutation(internal.snapshots.commitPartition, args);
        expect(await t.mutation(internal.snapshots.commitPartition, args)).toMatchObject({ replay: true });
      }
      await expect(t.mutation(internal.snapshots.completeRun, { keyHash, runId: "chunks", now })).rejects.toThrow("SNAPSHOT_RUN_INCOMPLETE");
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      await t.mutation(internal.snapshots.completeRun, { keyHash, runId: "chunks", now });
      expect((await t.query(api.public.profile, { handle: "snapshot" }))?.stats?.totalTokens).toBe(201);
      await t.mutation(internal.snapshots.beginRun, { ...begin, runId: "prune", partitionCount: 1 });
      await t.mutation(internal.snapshots.commitPartition, { ...part, runId: "prune", revision: 2, chunkIndex: 0, chunkCount: 1, partitionId: "prune", payloadHash: "prune", rows: rows.slice(0, 1) });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      await t.mutation(internal.snapshots.completeRun, { keyHash, runId: "prune", now });
      expect((await t.query(api.public.profile, { handle: "snapshot" }))?.stats?.totalTokens).toBe(1);
      expect(await t.run(ctx => ctx.db.query("collectorUsageSnapshots").collect())).toHaveLength(1);
    } finally { vi.useRealTimers(); }
  });

  test("does not permit a second adopt request to suppress real deltas", async () => {
    const now = Date.UTC(2026, 8, 14, 12);
    const { profileId } = await seed(t, now);
    await t.mutation(internal.snapshots.beginRun, { keyHash, runId: "native-one", mode: "full", requestedBaselineMode: "apply", sourceCount: 1, partitionCount: 1, inventoryComplete: true, inventoryErrors: 0, inventoryTruncated: false, now });
    await t.mutation(internal.snapshots.commitPartition, { keyHash, runId: "native-one", partitionId: "native-one:p", payloadHash: "one", revision: 1, source: "codex", day: "2026-09-14", complete: true, rows: [{ provider: "openai", model: "gpt-test", previous: counters(0), current: counters(20), costBasis: "estimated", contentHash: "one", lastUsedAt: now }], now });
    await t.mutation(internal.snapshots.completeRun, { keyHash, runId: "native-one", now });
    const begun = await t.mutation(internal.snapshots.beginRun, { keyHash, runId: "native-two", mode: "full", requestedBaselineMode: "adopt-current", sourceCount: 1, partitionCount: 1, inventoryComplete: true, inventoryErrors: 0, inventoryTruncated: false, now: now + 1 });
    expect(begun).toMatchObject({ baselineMode: "apply" });
    await t.mutation(internal.snapshots.commitPartition, { keyHash, runId: "native-two", partitionId: "native-two:p", payloadHash: "two", revision: 2, source: "codex", day: "2026-09-14", complete: true, rows: [{ provider: "openai", model: "gpt-test", previous: counters(20), current: counters(30), costBasis: "estimated", contentHash: "two", lastUsedAt: now + 1 }], now: now + 1 });
    await t.mutation(internal.snapshots.completeRun, { keyHash, runId: "native-two", now: now + 1 });
    const stats = await t.run(async (ctx) => ctx.db.query("profileStats").filter((q) => q.eq(q.field("profileId"), profileId)).unique());
    expect(stats?.totalTokens).toBe(30);
  });

  test("does not establish an interrupted legacy baseline until completion", async () => {
    const now = Date.UTC(2026, 8, 14, 12);
    const { collectorId } = await seed(t, now);
    await t.mutation(internal.snapshots.beginRun, { keyHash, runId: "legacy-interrupted", mode: "full", requestedBaselineMode: "adopt-current", sourceCount: 1, partitionCount: 2, inventoryComplete: true, inventoryErrors: 0, inventoryTruncated: false, now });
    await t.mutation(internal.snapshots.commitPartition, { keyHash, runId: "legacy-interrupted", partitionId: "legacy-interrupted:p", payloadHash: "one", revision: 1, source: "codex", day: "2026-09-14", complete: true, rows: [{ provider: "openai", model: "gpt-test", previous: counters(50), current: counters(40), costBasis: "estimated", contentHash: "one", lastUsedAt: now }], now });
    await t.mutation(internal.snapshots.failRun, { keyHash, runId: "legacy-interrupted", failureCode: "network_interrupted", now: now + 1 });
    const retry = await t.mutation(internal.snapshots.beginRun, { keyHash, runId: "legacy-retry", mode: "full", requestedBaselineMode: "adopt-current", sourceCount: 1, partitionCount: 1, inventoryComplete: true, inventoryErrors: 0, inventoryTruncated: false, now: now + 2 });
    expect(retry).toMatchObject({ baselineMode: "adopt-current" });
    const collector = await t.run(async (ctx) => ctx.db.get(collectorId));
    expect(collector?.snapshotBaselineMode).toBeUndefined();
    expect(collector?.snapshotBaselineEstablishedAt).toBeUndefined();
  });

  test("allows a failed first run to change baseline mode before completion", async () => {
    const now = Date.UTC(2026, 8, 14, 12);
    const { collectorId } = await seed(t, now);
    await t.mutation(internal.snapshots.beginRun, { keyHash, runId: "rewind", mode: "full", requestedBaselineMode: "apply", sourceCount: 1, partitionCount: 0, inventoryComplete: false, inventoryErrors: 1, inventoryTruncated: false, now });
    await t.mutation(internal.snapshots.failRun, { keyHash, runId: "rewind", failureCode: "legacy_bootstrap_rewound", now: now + 1 });
    const retry = await t.mutation(internal.snapshots.beginRun, { keyHash, runId: "legacy-retry", mode: "full", requestedBaselineMode: "adopt-current", sourceCount: 1, partitionCount: 0, inventoryComplete: true, inventoryErrors: 0, inventoryTruncated: false, now: now + 2 });
    expect(retry).toMatchObject({ baselineMode: "adopt-current" });
    const collector = await t.run(async (ctx) => ctx.db.get(collectorId));
    expect(collector?.snapshotBaselineMode).toBeUndefined();
    expect(collector?.snapshotBaselineEstablishedAt).toBeUndefined();
  });

  test("adopts over partial retry snapshots without replaying their stale delta", async () => {
    const now = Date.UTC(2026, 8, 14, 12);
    const { profileId } = await seed(t, now);
    await t.run(async (ctx) => {
      const stats = await ctx.db.query("profileStats").filter((q) => q.eq(q.field("profileId"), profileId)).unique();
      if (!stats) throw new Error("missing stats");
      await ctx.db.patch(stats._id, { totalTokens: 80, inputTokens: 80 });
    });
    await t.mutation(internal.snapshots.beginRun, { keyHash, runId: "partial-legacy", mode: "full", requestedBaselineMode: "adopt-current", sourceCount: 1, partitionCount: 2, inventoryComplete: true, inventoryErrors: 0, inventoryTruncated: false, now });
    await t.mutation(internal.snapshots.commitPartition, { keyHash, runId: "partial-legacy", partitionId: "partial-legacy:p", payloadHash: "one", revision: 1, source: "codex", day: "2026-09-14", complete: true, rows: [{ provider: "openai", model: "gpt-test", previous: counters(100), current: counters(80), costBasis: "estimated", contentHash: "one", lastUsedAt: now }], now });
    await t.mutation(internal.snapshots.failRun, { keyHash, runId: "partial-legacy", failureCode: "network_interrupted", now: now + 1 });
    await t.mutation(internal.snapshots.beginRun, { keyHash, runId: "partial-retry", mode: "full", requestedBaselineMode: "adopt-current", sourceCount: 1, partitionCount: 1, inventoryComplete: true, inventoryErrors: 0, inventoryTruncated: false, now: now + 2 });
    const committed = await t.mutation(internal.snapshots.commitPartition, { keyHash, runId: "partial-retry", partitionId: "partial-retry:p", payloadHash: "two", revision: 2, source: "codex", day: "2026-09-14", complete: true, rows: [{ provider: "openai", model: "gpt-test", previous: counters(100), current: counters(90), costBasis: "estimated", contentHash: "two", lastUsedAt: now + 2 }], now: now + 2 });
    expect(committed).toMatchObject({ changedRows: 0, correctionRows: 0 });
    const state = await t.run(async (ctx) => ({
      stats: await ctx.db.query("profileStats").filter((q) => q.eq(q.field("profileId"), profileId)).unique(),
      snapshot: await ctx.db.query("collectorUsageSnapshots").first(),
    }));
    expect(state.stats?.totalTokens).toBe(80);
    expect(state.snapshot?.totalTokens).toBe(90);
  });
});
