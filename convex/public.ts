import { v } from "convex/values";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";

async function profileByHandle(ctx: QueryCtx, handle: string) {
  return await ctx.db
    .query("profiles")
    .withIndex("by_handle", (q) => q.eq("handle", handle.toLowerCase()))
    .unique();
}

export const profile = query({
  args: { handle: v.string() },
  handler: async (ctx, args) => {
    const profile = await profileByHandle(ctx, args.handle);
    if (!profile?.isPublic) return null;
    const stats = await ctx.db
      .query("profileStats")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .unique();
    const models = await ctx.db
      .query("modelTotals")
      .withIndex("by_profileId_and_totalTokens", (q) => q.eq("profileId", profile._id))
      .order("desc")
      .take(12);
    return { profile, stats, models };
  },
});

export const daily = query({
  args: { handle: v.string(), days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const profile = await profileByHandle(ctx, args.handle);
    if (!profile?.isPublic) return [];
    const limit = Math.min(730, Math.max(1, Math.round(args.days ?? 365)));
    const rows = await ctx.db
      .query("dailyUsage")
      .withIndex("by_profileId_and_day", (q) => q.eq("profileId", profile._id))
      .order("desc")
      .take(4000);
    const days = new Map<string, { date: string; totalTokens: number; outputTokens: number; costMicros: number; sessions: number; requests: number; errors: number }>();
    for (const row of rows) {
      const current = days.get(row.day) ?? { date: row.day, totalTokens: 0, outputTokens: 0, costMicros: 0, sessions: 0, requests: 0, errors: 0 };
      current.totalTokens += row.totalTokens;
      current.outputTokens += row.outputTokens;
      current.costMicros += row.costMicros;
      current.sessions += row.sessions;
      current.requests += row.requests;
      current.errors += row.errors;
      days.set(row.day, current);
    }
    return [...days.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-limit);
  },
});

export const dailyModels = query({
  args: { handle: v.string(), days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const profile = await profileByHandle(ctx, args.handle);
    if (!profile?.isPublic) return [];
    const limit = Math.min(90, Math.max(1, Math.round(args.days ?? 30)));
    const rows = await ctx.db
      .query("dailyUsage")
      .withIndex("by_profileId_and_day", (q) => q.eq("profileId", profile._id))
      .order("desc")
      .take(4000);
    const cutoffDays = [...new Set(rows.map((row) => row.day))]
      .sort((a, b) => b.localeCompare(a))
      .slice(0, limit);
    const cutoff = new Set(cutoffDays);
    const grouped = new Map<string, {
      date: string;
      model: string;
      provider: string;
      totalTokens: number;
      costMicros: number;
    }>();
    for (const row of rows) {
      if (!cutoff.has(row.day)) continue;
      const key = `${row.day}\u0000${row.provider}\u0000${row.model}`;
      const current = grouped.get(key) ?? {
        date: row.day,
        model: row.model,
        provider: row.provider,
        totalTokens: 0,
        costMicros: 0,
      };
      current.totalTokens += row.totalTokens;
      current.costMicros += row.costMicros;
      grouped.set(key, current);
    }
    return [...grouped.values()].sort((a, b) =>
      a.date === b.date ? b.totalTokens - a.totalTokens : a.date.localeCompare(b.date),
    );
  },
});

export const leaderboard = query({
  args: {
    period: v.union(v.literal("7d"), v.literal("30d"), v.literal("all")),
    metric: v.union(v.literal("tokens"), v.literal("spend")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(100, Math.max(1, Math.round(args.limit ?? 50)));
    const rows = await ctx.db
      .query("leaderboardEntries")
      .withIndex("by_period_and_metric_and_score", (q) => q.eq("period", args.period).eq("metric", args.metric))
      .order("desc")
      .take(limit);
    const visibleRows = await Promise.all(rows.map(async (row) => {
      const profile = await ctx.db.get(row.profileId);
      if (!profile?.isPublic) return null;
      const stats = await ctx.db
        .query("profileStats")
        .withIndex("by_profileId", (q) => q.eq("profileId", row.profileId))
        .unique();
      return {
        ...row,
        sessions: stats?.sessions ?? 0,
        activeDays: stats?.activeDays ?? 0,
        lastEventAt: stats?.lastEventAt ?? row.updatedAt,
      };
    }));
    return visibleRows.filter((row) => row !== null);
  },
});

export const network = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("networkStats").withIndex("by_key", (q) => q.eq("key", "global")).unique();
  },
});

export const live = query({
  args: { handle: v.string(), now: v.number(), agentLimit: v.optional(v.number()), eventLimit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const profile = await profileByHandle(ctx, args.handle);
    if (!profile?.isPublic) return { agents: [], events: [] };
    const agents = await ctx.db
      .query("agentLiveStats")
      .withIndex("by_profileId_and_updatedAt", (q) => q.eq("profileId", profile._id))
      .order("desc")
      .take(Math.min(100, Math.max(1, Math.round(args.agentLimit ?? 50))));
    const events = await ctx.db
      .query("telemetryEvents")
      .withIndex("by_profileId_and_occurredAt", (q) => q.eq("profileId", profile._id))
      .order("desc")
      .take(Math.min(100, Math.max(1, Math.round(args.eventLimit ?? 30))));
    return {
      agents: agents.map((agent) => ({ ...agent, online: agent.expiresAt > args.now })),
      events,
    };
  },
});
