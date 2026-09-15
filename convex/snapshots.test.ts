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
});
