import { convexTest } from "convex-test";
import type { FunctionReturnType } from "convex/server";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const day = "2026-09-14";
test("collector release preflight advertises chunk protocol", async () => {
  const t = convexTest(schema, modules);
  expect(await t.query(api.public.collectorCapabilities, {})).toEqual({
    snapshotProtocol: 2, snapshotChunks: true, maxChunkRows: 100, recommendedCliVersion: "0.3.5",
  });
});
async function fixture(rollup = true) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const workspaceId = await ctx.db.insert("workspaces", { slug: "public", name: "Public", plan: "free", isPublic: true, retentionDays: 30, createdAt: 1 });
    const profileId = await ctx.db.insert("profiles", { workspaceId, handle: "public", displayName: "Public", bio: "", isPublic: true, isVerified: false, verification: "account", createdAt: 1 });
    if (rollup) await ctx.db.insert("profileDailyTotals", { workspaceId, profileId, day, totalTokens: 1, outputTokens: 1, costMicros: 1, sessions: 1, requests: 1, errors: 0, updatedAt: 1 });
    return { workspaceId, profileId };
  });
  async function add(count: number, kind: "model" | "source" | "device") {
    await t.run(async ctx => {
      for (let i = 0; i < count; i++) {
        if (kind === "model") await ctx.db.insert("dailyUsage", { ...ids, day, source: "private-origin", provider: "provider", model: "model", inputTokens: 0, outputTokens: 1, cacheReadTokens: 0, reasoningTokens: 0, totalTokens: 1, costMicros: 1, sessions: 1, requests: 1, errors: 0, updatedAt: 1 });
        else await ctx.db.insert("dailyDimensions", { ...ids, day, dimension: kind, key: kind === "device" ? "Device 1" : "CLI", keyHash: "secret-hash", origin: "private-origin", outputTokens: 1, unclassifiedTokens: 0, totalTokens: 1, costMicros: 1, costBasis: "reported", sessions: 1, updatedAt: 1 });
      }
    });
  }
  return { t, ids, add };
}

test.each(["model", "source", "device"] as const)("snapshot %s sentinel distinguishes 5000 from overflow", async kind => {
  const { t, add } = await fixture();
  const field = kind === "model" ? "dailyModels" : kind === "source" ? "sources" : "devices";
  await add(4999, kind);
  expect((await t.query(api.public.profileSnapshot, { handle: "public", includeLive: false }))?.coverage[field]).toBe("complete");
  await add(1, kind);
  const complete = await t.query(api.public.profileSnapshot, { handle: "public" });
  expect(complete?.coverage[field]).toBe("complete");
  const rows = kind === "model" ? complete!.dailyModels : complete!.breakdowns[field as "sources" | "devices"];
  expect(rows[0].totalTokens).toBe(5000);
  await add(1, kind);
  const overflow = await t.query(api.public.profileSnapshot, { handle: "public", includeLive: false });
  expect(overflow?.coverage[field]).toBe("truncated");
  expect(kind === "model" ? overflow!.dailyModels : overflow!.breakdowns[field as "sources" | "devices"]).toEqual([]);
  expect(overflow?.coverage.daily).toBe("complete");
});

test("legacy fallback detects 4001 and never supplies a false cutoff", async () => {
  const { t, add } = await fixture(false);
  await add(4000, "model");
  expect((await t.query(api.public.daily, { handle: "public" }))[0].totalTokens).toBe(4000);
  await add(1, "model");
  const snapshot = await t.query(api.public.profileSnapshot, { handle: "public" });
  expect(snapshot?.coverage).toEqual({ daily: "truncated", dailyModels: "truncated", sources: "truncated", devices: "truncated" });
  expect(snapshot?.daily).toEqual([]);
  await expect(t.query(api.public.daily, { handle: "public" })).rejects.toThrow("PUBLIC_DETAIL_LIMIT");
  await expect(t.query(api.public.dailyModels, { handle: "public" })).rejects.toThrow("PUBLIC_DETAIL_LIMIT");
});

test.each(["model", "source", "device"] as const)("legacy %s cap fails explicitly; pagination retrieves every safe row", async kind => {
  const { t, add, ids } = await fixture();
  await add(10001, kind);
  if (kind === "model") await expect(t.query(api.public.dailyModels, { handle: "public" })).rejects.toThrow("PUBLIC_DETAIL_LIMIT");
  else {
    await expect(t.query(api.public.dailyBreakdown, { handle: "public", groupBy: kind })).rejects.toThrow("PUBLIC_DETAIL_LIMIT");
    await expect(t.query(api.public.breakdowns, { handle: "public" })).rejects.toThrow("PUBLIC_DETAIL_LIMIT");
  }
  let cursor: string | null = null;
  let total = 0;
  for (let page = 0; page < 30; page++) {
    const result: FunctionReturnType<typeof api.public.dailyDetail> = await t.query(api.public.dailyDetail, { handle: "public", groupBy: kind, from: day, through: day, paginationOpts: { numItems: 500, cursor } });
    total += result.page.reduce((sum, row) => sum + row.totalTokens, 0);
    expect(JSON.stringify(result.page)).not.toMatch(/secret-hash|private-origin|workspaceId|profileId|_id/);
    if (result.isDone) break;
    cursor = result.continueCursor;
  }
  expect(total).toBe(10001);
  await t.run(ctx => ctx.db.patch(ids.profileId, { isPublic: false }));
  expect((await t.query(api.public.dailyDetail, { handle: "public", groupBy: kind, from: day, through: day, paginationOpts: { numItems: 500, cursor } })).page).toEqual([]);
});

test("six leaderboard branches exclude crowding and hydrate legacy privacy without refill", async () => {
  const { t, ids } = await fixture();
  await t.run(async ctx => {
    for (let i = 0; i < 350; i++) await ctx.db.insert("leaderboardEntries", { ...ids, handle: "private", displayName: "Private", verification: "account", isPublic: false, period: "all", metric: "tokens", score: 10000, totalTokens: 1, totalCostMicros: 0, updatedAt: 1 });
    for (const verification of ["account", "collector", "verified", "imported"]) {
      for (const isPublic of [true, undefined]) await ctx.db.insert("leaderboardEntries", { ...ids, handle: verification, displayName: verification, verification, ...(isPublic === undefined ? {} : { isPublic }), period: "all", metric: "tokens", score: 10, totalTokens: 10, totalCostMicros: 0, updatedAt: 1 });
    }
  });
  const rows = await t.query(api.public.leaderboard, { period: "all", metric: "tokens", limit: 10 });
  expect(rows).toHaveLength(6);
  expect(rows.every(row => row.verification !== "imported")).toBe(true);
  expect(rows.map(row => row._creationTime)).toEqual(rows.map(row => row._creationTime).sort((a, b) => b - a));
  expect(await t.query(api.public.networkPulse, { limit: 6 })).toHaveLength(6);
  await t.run(ctx => ctx.db.patch(ids.profileId, { isPublic: false }));
  expect(await t.query(api.public.leaderboard, { period: "all", metric: "tokens" })).toEqual([]);
  expect(await t.query(api.public.networkPulse, {})).toEqual([]);
});

test("live opt-out preserves default and independently enforces visibility", async () => {
  const { t, ids } = await fixture();
  await t.run(ctx => ctx.db.insert("agentLiveStats", { ...ids, externalId: "agent", name: "Agent", model: "model", state: "working", tokensPerSecond: 1, totalTokens: 1, toolCalls: 0, errorCount: 0, sessionStartedAt: 1, updatedAt: 1, expiresAt: 9999999999999 }));
  expect((await t.query(api.public.profileSnapshot, { handle: "public" }))?.live.agents).toHaveLength(1);
  expect((await t.query(api.public.profileSnapshot, { handle: "public", includeLive: false }))?.live).toEqual({ agents: [], events: [] });
  expect((await t.query(api.public.live, { handle: "public" })).agents).toHaveLength(1);
  await t.run(ctx => ctx.db.patch(ids.profileId, { verification: "imported" }));
  expect(await t.query(api.public.profileSnapshot, { handle: "public" })).toBeNull();
  expect(await t.query(api.public.live, { handle: "public" })).toEqual({ agents: [], events: [] });
  expect((await t.query(api.public.dailyDetail, { handle: "public", groupBy: "model", from: day, through: day, paginationOpts: { numItems: 100, cursor: null } })).page).toEqual([]);
});
