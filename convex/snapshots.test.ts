import { createHash } from "node:crypto";
import { beforeEach, describe, expect, test } from "vitest";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";

import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const token = "umx_snapshot_0123456789abcdef0123456789abcdef";
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

  test("applies downward corrections and keeps provider identity", async () => {
    const now = Date.UTC(2026, 8, 14, 12);
    await seed(t, now);
    await t.mutation(internal.snapshots.beginRun, { keyHash, runId: "run-1", mode: "full", sourceCount: 1, partitionCount: 1, inventoryComplete: true, inventoryErrors: 0, inventoryTruncated: false, coverageStartDay: "2026-09-14", coverageEndDay: "2026-09-14", now });
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

    await t.mutation(internal.snapshots.beginRun, { keyHash, runId: "run-2", mode: "full", sourceCount: 1, partitionCount: 1, inventoryComplete: true, inventoryErrors: 0, inventoryTruncated: false, coverageStartDay: "2026-09-14", coverageEndDay: "2026-09-14", now: now + 1 });
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

  test("keeps an interrupted legacy baseline in adopt mode on retry", async () => {
    const now = Date.UTC(2026, 8, 14, 12);
    const { collectorId } = await seed(t, now);
    await t.mutation(internal.snapshots.beginRun, { keyHash, runId: "legacy-interrupted", mode: "full", requestedBaselineMode: "adopt-current", sourceCount: 1, partitionCount: 2, inventoryComplete: true, inventoryErrors: 0, inventoryTruncated: false, now });
    await t.mutation(internal.snapshots.commitPartition, { keyHash, runId: "legacy-interrupted", partitionId: "legacy-interrupted:p", payloadHash: "one", revision: 1, source: "codex", day: "2026-09-14", complete: true, rows: [{ provider: "openai", model: "gpt-test", previous: counters(50), current: counters(40), costBasis: "estimated", contentHash: "one", lastUsedAt: now }], now });
    await t.mutation(internal.snapshots.failRun, { keyHash, runId: "legacy-interrupted", failureCode: "network_interrupted", now: now + 1 });
    const retry = await t.mutation(internal.snapshots.beginRun, { keyHash, runId: "legacy-retry", mode: "full", requestedBaselineMode: "apply", sourceCount: 1, partitionCount: 1, inventoryComplete: true, inventoryErrors: 0, inventoryTruncated: false, now: now + 2 });
    expect(retry).toMatchObject({ baselineMode: "adopt-current" });
    const collector = await t.run(async (ctx) => ctx.db.get(collectorId));
    expect(collector).toMatchObject({ snapshotBaselineMode: "legacy_adopted" });
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
