import { v } from "convex/values";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";

type CostBasis = "reported" | "estimated" | "api-equivalent" | "mixed" | "unknown";

function mergeCostBasis(left: CostBasis | undefined, right: CostBasis | undefined): CostBasis | undefined {
  if (!right) return left;
  if (!left || left === right) return right;
  return "mixed";
}

async function profileByHandle(ctx: QueryCtx, handle: string) {
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_handle", (q) => q.eq("handle", handle.toLowerCase()))
    .unique();
  return profile?.verification === "imported" ? null : profile;
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
      .withIndex("by_profileId_and_costMicros", (q) => q.eq("profileId", profile._id))
      .order("desc")
      .take(12);
    return { profile, stats, models };
  },
});

/**
 * One reactive read for the complete public profile surface. Keeping the
 * dependency set server-side avoids five independent websocket subscriptions
 * and guarantees every chart in a rendered frame came from one Convex snapshot.
 */
export const profileSnapshot = query({
  args: {
    handle: v.string(),
    days: v.optional(v.number()),
    agentLimit: v.optional(v.number()),
    eventLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const profile = await profileByHandle(ctx, args.handle);
    if (!profile?.isPublic) return null;
    const dayLimit = Math.min(365, Math.max(30, Math.round(args.days ?? 365)));
    const [stats, models, aggregateDays, agents, events] = await Promise.all([
      ctx.db.query("profileStats").withIndex("by_profileId", (q) => q.eq("profileId", profile._id)).unique(),
      ctx.db.query("modelTotals").withIndex("by_profileId_and_costMicros", (q) => q.eq("profileId", profile._id)).order("desc").take(12),
      ctx.db.query("profileDailyTotals").withIndex("by_profileId_and_day", (q) => q.eq("profileId", profile._id)).order("desc").take(dayLimit),
      ctx.db.query("agentLiveStats").withIndex("by_profileId_and_updatedAt", (q) => q.eq("profileId", profile._id)).order("desc").take(Math.min(50, Math.max(1, Math.round(args.agentLimit ?? 12)))),
      ctx.db.query("telemetryEvents").withIndex("by_profileId_and_occurredAt", (q) => q.eq("profileId", profile._id)).order("desc").take(Math.min(50, Math.max(1, Math.round(args.eventLimit ?? 24)))),
    ]);

    let daily: Array<{
      date: string;
      totalTokens: number;
      outputTokens: number;
      unclassifiedTokens: number;
      costMicros: number;
      costBasis?: CostBasis;
      sessions: number;
      requests: number;
      errors: number;
    }>;
    // Assigned only for profiles created before daily rollups existed. The
    // explicit document shape keeps that compatibility read bounded.
    let fallbackRows: Array<{
      day: string;
      provider: string;
      model: string;
      totalTokens: number;
      outputTokens: number;
      unclassifiedTokens?: number;
      costMicros: number;
      costBasis?: CostBasis;
      sessions: number;
      requests: number;
      errors: number;
    }> = [];
    if (aggregateDays.length) {
      daily = aggregateDays.map((row) => ({
        date: row.day,
        totalTokens: row.totalTokens,
        outputTokens: row.outputTokens,
        unclassifiedTokens: row.unclassifiedTokens ?? 0,
        costMicros: row.costMicros,
        costBasis: row.costBasis ?? "unknown",
        sessions: row.sessions,
        requests: row.requests,
        errors: row.errors,
      })).reverse();
    } else {
      fallbackRows = await ctx.db.query("dailyUsage").withIndex("by_profileId_and_day", (q) => q.eq("profileId", profile._id)).order("desc").take(4000);
      const groupedDays = new Map<string, (typeof daily)[number]>();
      for (const row of fallbackRows) {
        const current = groupedDays.get(row.day) ?? { date: row.day, totalTokens: 0, outputTokens: 0, unclassifiedTokens: 0, costMicros: 0, costBasis: undefined, sessions: 0, requests: 0, errors: 0 };
        current.totalTokens += row.totalTokens;
        current.outputTokens += row.outputTokens;
        current.unclassifiedTokens += row.unclassifiedTokens ?? 0;
        current.costMicros += row.costMicros;
        current.costBasis = mergeCostBasis(current.costBasis, row.costBasis);
        current.sessions += row.sessions;
        current.requests += row.requests;
        current.errors += row.errors;
        groupedDays.set(row.day, current);
      }
      daily = [...groupedDays.values()].sort((left, right) => left.date.localeCompare(right.date)).slice(-dayLimit);
    }

    const recentDayKeys = daily.slice(-30).map((row) => row.date);
    const cutoffDay = recentDayKeys[0];
    const [usageRows, sourceRows, deviceRows] = cutoffDay
      ? await Promise.all([
          fallbackRows.length
            ? Promise.resolve(fallbackRows.filter((row) => row.day >= cutoffDay))
            : ctx.db.query("dailyUsage").withIndex("by_profileId_and_day", (q) => q.eq("profileId", profile._id).gte("day", cutoffDay)).collect(),
          ctx.db.query("dailyDimensions").withIndex("by_profileId_and_dimension_and_day", (q) => q.eq("profileId", profile._id).eq("dimension", "source").gte("day", cutoffDay)).collect(),
          ctx.db.query("dailyDimensions").withIndex("by_profileId_and_dimension_and_day", (q) => q.eq("profileId", profile._id).eq("dimension", "device").gte("day", cutoffDay)).collect(),
        ])
      : [[], [], []];

    const dailyModelMap = new Map<string, { date: string; model: string; provider: string; totalTokens: number; costMicros: number; costBasis?: CostBasis }>();
    for (const row of usageRows) {
      const key = `${row.day}\u0000${row.provider}\u0000${row.model}`;
      const current = dailyModelMap.get(key) ?? { date: row.day, model: row.model, provider: row.provider, totalTokens: 0, costMicros: 0, costBasis: undefined };
      current.totalTokens += row.totalTokens;
      current.costMicros += row.costMicros;
      current.costBasis = mergeCostBasis(current.costBasis, row.costBasis);
      dailyModelMap.set(key, current);
    }
    const summarize = (rows: typeof sourceRows) => {
      const totals = new Map<string, { key: string; totalTokens: number; costMicros: number }>();
      for (const row of rows) {
        const current = totals.get(row.key) ?? { key: row.key, totalTokens: 0, costMicros: 0 };
        current.totalTokens += row.totalTokens;
        current.costMicros += row.costMicros;
        totals.set(row.key, current);
      }
      return [...totals.values()].sort((left, right) => right.totalTokens - left.totalTokens).slice(0, 12);
    };

    return {
      profile,
      stats,
      models,
      daily,
      dailyModels: [...dailyModelMap.values()].sort((left, right) => left.date === right.date ? right.totalTokens - left.totalTokens : left.date.localeCompare(right.date)),
      breakdowns: { sources: summarize(sourceRows), devices: summarize(deviceRows) },
      live: {
        agents: agents.map((agent) => ({
          externalId: agent.externalId,
          parentExternalId: agent.parentExternalId,
          name: agent.name,
          model: agent.model,
          state: agent.state,
          task: agent.task,
          tokensPerSecond: agent.tokensPerSecond,
          totalTokens: agent.totalTokens,
          toolCalls: agent.toolCalls,
          errorCount: agent.errorCount,
          sessionStartedAt: agent.sessionStartedAt,
          updatedAt: agent.updatedAt,
          expiresAt: agent.expiresAt,
        })),
        events: events.map((event) => ({
          _id: event._id,
          eventKey: event.eventKey,
          agentName: event.agentName,
          eventType: event.eventType,
          source: event.source,
          model: event.model,
          totalTokens: event.totalTokens,
          costMicros: event.costMicros,
          latencyMs: event.latencyMs,
          status: event.status,
          occurredAt: event.occurredAt,
        })),
      },
    };
  },
});

export const daily = query({
  args: { handle: v.string(), days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const profile = await profileByHandle(ctx, args.handle);
    if (!profile?.isPublic) return [];
    const limit = Math.min(730, Math.max(1, Math.round(args.days ?? 365)));
    const rows = await ctx.db
      .query("profileDailyTotals")
      .withIndex("by_profileId_and_day", (q) => q.eq("profileId", profile._id))
      .order("desc")
      .take(limit);
    if (rows.length === 0) {
      const legacyRows = await ctx.db
        .query("dailyUsage")
        .withIndex("by_profileId_and_day", (q) => q.eq("profileId", profile._id))
        .order("desc")
        .take(4000);
      const days = new Map<string, { date: string; totalTokens: number; outputTokens: number; unclassifiedTokens: number; costMicros: number; costBasis?: CostBasis; sessions: number; requests: number; errors: number }>();
      for (const row of legacyRows) {
        const current = days.get(row.day) ?? { date: row.day, totalTokens: 0, outputTokens: 0, unclassifiedTokens: 0, costMicros: 0, costBasis: undefined, sessions: 0, requests: 0, errors: 0 };
        current.totalTokens += row.totalTokens;
        current.outputTokens += row.outputTokens;
        current.unclassifiedTokens += row.unclassifiedTokens ?? 0;
        current.costMicros += row.costMicros;
        current.costBasis = mergeCostBasis(current.costBasis, row.costBasis);
        current.sessions += row.sessions;
        current.requests += row.requests;
        current.errors += row.errors;
        days.set(row.day, current);
      }
      return [...days.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-limit);
    }
    return rows
      .map((row) => ({
        date: row.day,
        totalTokens: row.totalTokens,
        outputTokens: row.outputTokens,
        unclassifiedTokens: row.unclassifiedTokens ?? 0,
        costMicros: row.costMicros,
        costBasis: row.costBasis ?? "unknown",
        sessions: row.sessions,
        requests: row.requests,
        errors: row.errors,
      }))
      .reverse();
  },
});

export const dailyModels = query({
  args: { handle: v.string(), days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const profile = await profileByHandle(ctx, args.handle);
    if (!profile?.isPublic) return [];
    const limit = Math.min(90, Math.max(1, Math.round(args.days ?? 30)));
    const recentDays = await ctx.db
      .query("profileDailyTotals")
      .withIndex("by_profileId_and_day", (q) => q.eq("profileId", profile._id))
      .order("desc")
      .take(limit);
    let cutoffDay = recentDays.at(-1)?.day;
    if (!cutoffDay) {
      const legacyRows = await ctx.db
        .query("dailyUsage")
        .withIndex("by_profileId_and_day", (q) => q.eq("profileId", profile._id))
        .order("desc")
        .take(4000);
      cutoffDay = [...new Set(legacyRows.map((row) => row.day))]
        .sort((a, b) => b.localeCompare(a))
        .slice(0, limit)
        .at(-1);
    }
    if (!cutoffDay) return [];
    const queriedRows = (await Promise.all(recentDays.map((day) => ctx.db
      .query("dailyUsage")
      .withIndex("by_profileId_and_day", (q) => q.eq("profileId", profile._id).eq("day", day.day))
      .collect()))).flat();
    const grouped = new Map<string, {
      date: string;
      model: string;
      provider: string;
      totalTokens: number;
      costMicros: number;
      costBasis?: CostBasis;
    }>();
    for (const row of queriedRows) {
      const key = `${row.day}\u0000${row.provider}\u0000${row.model}`;
      const current = grouped.get(key) ?? {
        date: row.day,
        model: row.model,
        provider: row.provider,
        totalTokens: 0,
        costMicros: 0,
        costBasis: undefined,
      };
      current.totalTokens += row.totalTokens;
      current.costMicros += row.costMicros;
      current.costBasis = mergeCostBasis(current.costBasis, row.costBasis);
      grouped.set(key, current);
    }
    return [...grouped.values()].sort((a, b) =>
      a.date === b.date ? b.totalTokens - a.totalTokens : a.date.localeCompare(b.date),
    );
  },
});

export const dailyBreakdown = query({
  args: {
    handle: v.string(),
    groupBy: v.union(v.literal("source"), v.literal("device")),
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const profile = await profileByHandle(ctx, args.handle);
    if (!profile?.isPublic) return [];
    const limit = Math.min(365, Math.max(1, Math.round(args.days ?? 365)));
    const recentDays = await ctx.db
      .query("profileDailyTotals")
      .withIndex("by_profileId_and_day", (q) => q.eq("profileId", profile._id))
      .order("desc")
      .take(limit);
    const cutoffDay = recentDays.at(-1)?.day;
    if (!cutoffDay) return [];
    const rows = (await Promise.all(recentDays.map((day) => ctx.db
      .query("dailyDimensions")
      .withIndex("by_profileId_and_dimension_and_day", (q) =>
        q.eq("profileId", profile._id).eq("dimension", args.groupBy).eq("day", day.day),
      )
      .collect()))).flat();
    return rows
      .map((row) => ({
        date: row.day,
        key: row.key,
        outputTokens: row.outputTokens,
        unclassifiedTokens: row.unclassifiedTokens,
        totalTokens: row.totalTokens,
        costMicros: row.costMicros,
        costBasis: row.costBasis,
        sessions: row.sessions,
      }))
      .sort((left, right) => left.date === right.date
        ? right.totalTokens - left.totalTokens
        : left.date.localeCompare(right.date));
  },
});

export const breakdowns = query({
  args: { handle: v.string(), days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const profile = await profileByHandle(ctx, args.handle);
    if (!profile?.isPublic) return { sources: [], devices: [] };
    const days = Math.min(90, Math.max(1, Math.round(args.days ?? 30)));
    const recentDays = await ctx.db
      .query("profileDailyTotals")
      .withIndex("by_profileId_and_day", (q) => q.eq("profileId", profile._id))
      .order("desc")
      .take(days);
    const cutoff = recentDays.at(-1)?.day;
    if (!cutoff) return { sources: [], devices: [] };
    const [sourceRows, deviceRows] = await Promise.all([
      Promise.all(recentDays.map((day) => ctx.db
        .query("dailyDimensions")
        .withIndex("by_profileId_and_dimension_and_day", (q) =>
          q.eq("profileId", profile._id).eq("dimension", "source").eq("day", day.day),
        )
        .collect())).then((rows) => rows.flat()),
      Promise.all(recentDays.map((day) => ctx.db
        .query("dailyDimensions")
        .withIndex("by_profileId_and_dimension_and_day", (q) =>
          q.eq("profileId", profile._id).eq("dimension", "device").eq("day", day.day),
        )
        .collect())).then((rows) => rows.flat()),
    ]);
    const summarize = (rows: typeof sourceRows) => {
      const totals = new Map<string, { key: string; totalTokens: number; costMicros: number }>();
      for (const row of rows) {
        const current = totals.get(row.key) ?? { key: row.key, totalTokens: 0, costMicros: 0 };
        current.totalTokens += row.totalTokens;
        current.costMicros += row.costMicros;
        totals.set(row.key, current);
      }
      return [...totals.values()].sort((left, right) => right.totalTokens - left.totalTokens).slice(0, 12);
    };
    return { sources: summarize(sourceRows), devices: summarize(deviceRows) };
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
      .filter((q) => q.neq(q.field("verification"), "imported"))
      .order("desc")
      .take(Math.min(300, limit * 3));
    return rows
      .filter((row) => row.isPublic !== false)
      .slice(0, limit)
      .map((row) => ({
        ...row,
        sessions: row.sessions ?? 0,
        activeDays: row.activeDays ?? 0,
        lastEventAt: row.lastEventAt ?? row.updatedAt,
      }));
  },
});

export const network = query({
  args: {},
  handler: async (ctx) => {
    // networkStats is a retired aggregate-import baseline. First-party account
    // and telemetry counters live exclusively in bounded shards.
    const shards = await ctx.db.query("networkCounterShards").collect();
    const today = new Date().toISOString().slice(0, 10);
    return {
      totalTokens: shards.reduce((sum, shard) => sum + shard.totalTokens, 0),
      totalCostMicros: shards.reduce((sum, shard) => sum + shard.totalCostMicros, 0),
      totalSessions: shards.reduce((sum, shard) => sum + shard.totalSessions, 0),
      profiles: shards.reduce((sum, shard) => sum + shard.profiles, 0),
      // Agent expiry is interpreted from heartbeats by live clients. Avoid a
      // wall-clock-dependent query that cannot invalidate the Convex cache.
      activeAgents: 0,
      eventsToday: shards.filter((shard) => shard.eventsDay === today).reduce((sum, shard) => sum + shard.eventsToday, 0),
      updatedAt: Math.max(...shards.map((shard) => shard.updatedAt), 0),
    };
  },
});

export const live = query({
  args: { handle: v.string(), agentLimit: v.optional(v.number()), eventLimit: v.optional(v.number()) },
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
      agents: agents.map((agent) => ({
        externalId: agent.externalId,
        parentExternalId: agent.parentExternalId,
        name: agent.name,
        model: agent.model,
        state: agent.state,
        task: agent.task,
        tokensPerSecond: agent.tokensPerSecond,
        totalTokens: agent.totalTokens,
        toolCalls: agent.toolCalls,
        errorCount: agent.errorCount,
        sessionStartedAt: agent.sessionStartedAt,
        updatedAt: agent.updatedAt,
        expiresAt: agent.expiresAt,
      })),
      events: events.map((event) => ({
        eventKey: event.eventKey,
        agentName: event.agentName,
        eventType: event.eventType,
        source: event.source,
        model: event.model,
        totalTokens: event.totalTokens,
        costMicros: event.costMicros,
        latencyMs: event.latencyMs,
        status: event.status,
        occurredAt: event.occurredAt,
      })),
    };
  },
});

export const networkPulse = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(6, Math.max(1, Math.round(args.limit ?? 3)));
    const rows = await ctx.db
      .query("leaderboardEntries")
      .withIndex("by_period_and_metric_and_score", (q) => q.eq("period", "all").eq("metric", "tokens"))
      .order("desc")
      .take(30);
    return rows
      .filter((row) => row.isPublic !== false && row.verification !== "imported")
      .slice(0, limit)
      .map((row) => ({
        handle: row.handle,
        displayName: row.displayName,
        verification: row.verification,
        totalTokens: row.totalTokens,
        totalCostMicros: row.totalCostMicros,
        sessions: row.sessions ?? 0,
        lastUploadAt: row.lastEventAt ?? row.updatedAt,
      }));
  },
});
