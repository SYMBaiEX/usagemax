import { beforeEach, describe, expect, test } from "vitest";
import { convexTest } from "convex-test";

import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

describe("public usage dimensions", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  test("returns stable device aliases without storing hostnames in public rows", async () => {
    const now = Date.UTC(2026, 8, 14, 12);
    await t.run(async (ctx) => {
      const workspaceId = await ctx.db.insert("workspaces", {
        slug: "privacy-builder",
        name: "Privacy Builder workspace",
        plan: "free",
        isPublic: true,
        retentionDays: 30,
        createdAt: now,
      });
      const profileId = await ctx.db.insert("profiles", {
        workspaceId,
        handle: "privacy-builder",
        displayName: "Privacy Builder",
        bio: "",
        isPublic: true,
        isVerified: false,
        verification: "collector",
        createdAt: now,
      });
      await ctx.db.insert("profileDailyTotals", {
        workspaceId,
        profileId,
        day: "2026-09-14",
        outputTokens: 20,
        totalTokens: 120,
        costMicros: 500,
        sessions: 1,
        requests: 1,
        errors: 0,
        updatedAt: now,
      });
      await ctx.db.insert("profileDevices", {
        workspaceId,
        profileId,
        deviceHash: "salted-device-hash",
        publicLabel: "Device 1",
        firstSeenAt: now,
        lastSeenAt: now,
      });
      await ctx.db.insert("dailyDimensions", {
        workspaceId,
        profileId,
        day: "2026-09-14",
        dimension: "device",
        key: "Device 1",
        keyHash: "salted-device-hash",
        origin: "collector:test",
        outputTokens: 20,
        unclassifiedTokens: 0,
        totalTokens: 120,
        costMicros: 500,
        costBasis: "estimated",
        sessions: 1,
        updatedAt: now,
      });
    });

    const rows = await t.query(api.public.dailyBreakdown, {
      handle: "privacy-builder",
      groupBy: "device",
      days: 30,
    });
    expect(rows).toEqual([expect.objectContaining({ key: "Device 1", totalTokens: 120 })]);
    expect(JSON.stringify(rows)).not.toContain("salted-device-hash");

    const snapshot = await t.query(api.public.profileSnapshot, { handle: "privacy-builder", days: 365 });
    expect(snapshot).toMatchObject({
      profile: { handle: "privacy-builder" },
      daily: [expect.objectContaining({ date: "2026-09-14", totalTokens: 120 })],
      breakdowns: { devices: [expect.objectContaining({ key: "Device 1", totalTokens: 120 })] },
      live: { agents: [], events: [] },
    });
  });

  test("quarantines retired imported profiles from every public aggregate", async () => {
    const now = Date.UTC(2026, 8, 14, 12);
    await t.run(async (ctx) => {
      const workspaceId = await ctx.db.insert("workspaces", {
        slug: "retired-import",
        name: "Retired import",
        plan: "free",
        isPublic: true,
        retentionDays: 30,
        createdAt: now,
      });
      const profileId = await ctx.db.insert("profiles", {
        workspaceId,
        handle: "retired-import",
        displayName: "Retired import",
        bio: "",
        isPublic: true,
        isVerified: false,
        verification: "imported",
        createdAt: now,
      });
      await ctx.db.insert("leaderboardEntries", {
        workspaceId,
        profileId,
        period: "all",
        metric: "tokens",
        handle: "retired-import",
        displayName: "Retired import",
        verification: "imported",
        score: 99_000,
        totalTokens: 99_000,
        totalCostMicros: 10_000,
        sessions: 1,
        activeDays: 1,
        isPublic: true,
        updatedAt: now,
      });
      await ctx.db.insert("networkStats", {
        key: "global",
        totalTokens: 99_000,
        totalCostMicros: 10_000,
        totalSessions: 1,
        profiles: 1,
        activeAgents: 0,
        eventsToday: 1,
        updatedAt: now,
      });
    });

    await expect(t.query(api.public.profile, { handle: "retired-import" })).resolves.toBeNull();
    await expect(t.query(api.public.leaderboard, { period: "all", metric: "tokens", limit: 10 })).resolves.toEqual([]);
    await expect(t.query(api.public.network, {})).resolves.toMatchObject({
      totalTokens: 0,
      totalCostMicros: 0,
      totalSessions: 0,
      profiles: 0,
    });
  });
});
