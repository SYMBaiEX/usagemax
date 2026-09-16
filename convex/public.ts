import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";

type CostBasis = "reported" | "estimated" | "api-equivalent" | "mixed" | "unknown";

export const collectorCapabilities = query({
  args: {},
  handler: async () => ({
    snapshotProtocol: 2,
    snapshotChunks: true,
    maxChunkRows: 100,
    recommendedCliVersion: "0.3.6",
  }),
});

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
 * Historical charts share one transaction. New clients opt out of live reads;
 * the default preserves the original combined contract for existing clients.
 */
export const profileSnapshot = query({
  args: {
    handle: v.string(),
    days: v.optional(v.number()),
    includeLive: v.optional(v.boolean()),
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
      args.includeLive === false ? Promise.resolve([]) : ctx.db.query("agentLiveStats").withIndex("by_profileId_and_updatedAt", (q) => q.eq("profileId", profile._id)).order("desc").take(Math.min(50, Math.max(1, Math.round(args.agentLimit ?? 12)))),
      args.includeLive === false ? Promise.resolve([]) : ctx.db.query("telemetryEvents").withIndex("by_profileId_and_occurredAt", (q) => q.eq("profileId", profile._id)).order("desc").take(Math.min(50, Math.max(1, Math.round(args.eventLimit ?? 24)))),
    ]);

    const coverage: Record<"daily" | "dailyModels" | "sources" | "devices", "complete" | "truncated"> = { daily: "complete", dailyModels: "complete", sources: "complete", devices: "complete" };
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
      fallbackRows = await ctx.db.query("dailyUsage").withIndex("by_profileId_and_day", (q) => q.eq("profileId", profile._id)).order("desc").take(4001);
      if (fallbackRows.length > 4000) {
        coverage.daily = coverage.dailyModels = coverage.sources = coverage.devices = "truncated";
        fallbackRows = [];
      }
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
            : ctx.db.query("dailyUsage").withIndex("by_profileId_and_day", (q) => q.eq("profileId", profile._id).gte("day", cutoffDay)).order("desc").take(5001),
          ctx.db.query("dailyDimensions").withIndex("by_profileId_and_dimension_and_day", (q) => q.eq("profileId", profile._id).eq("dimension", "source").gte("day", cutoffDay)).order("desc").take(5001),
          ctx.db.query("dailyDimensions").withIndex("by_profileId_and_dimension_and_day", (q) => q.eq("profileId", profile._id).eq("dimension", "device").gte("day", cutoffDay)).order("desc").take(5001),
        ])
      : [[], [], []];

    if (usageRows.length > 5000) coverage.dailyModels = "truncated";
    if (sourceRows.length > 5000) coverage.sources = "truncated";
    if (deviceRows.length > 5000) coverage.devices = "truncated";
    const dailyModelMap = new Map<string, { date: string; model: string; provider: string; totalTokens: number; costMicros: number; costBasis?: CostBasis }>();
    for (const row of coverage.dailyModels === "complete" ? usageRows : []) {
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
      coverage,
      dailyModels: [...dailyModelMap.values()].sort((left, right) => left.date === right.date ? right.totalTokens - left.totalTokens : left.date.localeCompare(right.date)),
      breakdowns: { sources: coverage.sources === "complete" ? summarize(sourceRows) : [], devices: coverage.devices === "complete" ? summarize(deviceRows) : [] },
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
        .take(4001);
      assertComplete(legacyRows, 4000);
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
        .take(4001);
      assertComplete(legacyRows, 4000);
      cutoffDay = [...new Set(legacyRows.map((row) => row.day))]
        .sort((a, b) => b.localeCompare(a))
        .slice(0, limit)
        .at(-1);
    }
    if (!cutoffDay) return [];
    const queriedRows = await ctx.db
      .query("dailyUsage")
      .withIndex("by_profileId_and_day", (q) => q.eq("profileId", profile._id).gte("day", cutoffDay))
      .order("desc")
      .take(10_001);
    assertComplete(queriedRows, 10_000);
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
    const rows = await ctx.db
      .query("dailyDimensions")
      .withIndex("by_profileId_and_dimension_and_day", (q) =>
        q.eq("profileId", profile._id).eq("dimension", args.groupBy).gte("day", cutoffDay),
      )
      .order("desc")
      .take(10_001);
    assertComplete(rows, 10_000);
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
      ctx.db.query("dailyDimensions")
        .withIndex("by_profileId_and_dimension_and_day", (q) =>
          q.eq("profileId", profile._id).eq("dimension", "source").gte("day", cutoff),
        )
        .order("desc")
        .take(5001),
      ctx.db.query("dailyDimensions")
        .withIndex("by_profileId_and_dimension_and_day", (q) =>
          q.eq("profileId", profile._id).eq("dimension", "device").gte("day", cutoff),
        )
        .order("desc")
        .take(5001),
    ]);
    assertComplete(sourceRows, 5000);
    assertComplete(deviceRows, 5000);
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
    const rows = await publicRanking(ctx, args.period, args.metric, limit);
    return rows
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
    const rows = await publicRanking(ctx, "all", "tokens", limit);
    return rows
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

function assertComplete(rows: unknown[], limit: number) {
  if (rows.length > limit) throw new ConvexError({
    code: "PUBLIC_DETAIL_LIMIT",
    message: "This range exceeds the summary limit. Use public.dailyDetail pagination.",
  });
}

async function publicRanking(ctx: QueryCtx, period: "7d" | "30d" | "all", metric: "tokens" | "spend", limit: number) {
  const branches = await Promise.all(([true, undefined] as const).flatMap((isPublic) =>
    (["account", "collector", "verified"] as const).map((verification) =>
      ctx.db.query("leaderboardEntries")
        .withIndex("by_period_and_metric_and_isPublic_and_verification_and_score", q =>
          q.eq("period", period).eq("metric", metric).eq("isPublic", isPublic).eq("verification", verification))
        .order("desc").take(limit))));
  // Hydrate bounded candidates; never refill a branch after rejecting stale privacy.
  const checked = await Promise.all(branches.flat().map(async row => {
    const profile = await ctx.db.get(row.profileId);
    return profile?.isPublic && profile.verification !== "imported" ? row : null;
  }));
  return checked.filter(row => row !== null)
    .sort((a, b) => b.score - a.score || b._creationTime - a._creationTime || b._id.localeCompare(a._id))
    .slice(0, limit);
}

/** Raw additive detail rows: sum across every page before claiming range totals. */
export const dailyDetail = query({
  args: {
    handle: v.string(),
    groupBy: v.union(v.literal("model"), v.literal("source"), v.literal("device")),
    from: v.string(),
    through: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    if (![args.from, args.through].every(day => /^\d{4}-\d{2}-\d{2}$/.test(day) &&
      Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day) || args.from > args.through)
      throw new ConvexError("INVALID_DATE_RANGE");
    if (!Number.isInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 500)
      throw new ConvexError("INVALID_PAGE_SIZE");
    const profile = await profileByHandle(ctx, args.handle);
    if (!profile?.isPublic) return { page: [], isDone: true, continueCursor: "", consistentSnapshot: false };
    if (args.groupBy === "model") {
      const result = await ctx.db.query("dailyUsage").withIndex("by_profileId_and_day", q =>
        q.eq("profileId", profile._id).gte("day", args.from).lte("day", args.through))
        .order("asc").paginate(args.paginationOpts);
      return { ...result, consistentSnapshot: false, page: result.page.map(row => ({
        date: row.day, key: row.model, provider: row.provider, totalTokens: row.totalTokens,
        outputTokens: row.outputTokens, unclassifiedTokens: row.unclassifiedTokens ?? 0,
        costMicros: row.costMicros, costBasis: row.costBasis ?? "unknown", sessions: row.sessions,
      })) };
    }
    const result = await ctx.db.query("dailyDimensions").withIndex("by_profileId_and_dimension_and_day", q =>
      q.eq("profileId", profile._id).eq("dimension", args.groupBy as "source" | "device")
        .gte("day", args.from).lte("day", args.through)).order("asc").paginate(args.paginationOpts);
    return { ...result, consistentSnapshot: false, page: result.page.map(row => ({
      date: row.day, key: row.key, totalTokens: row.totalTokens, outputTokens: row.outputTokens,
      unclassifiedTokens: row.unclassifiedTokens ?? 0, costMicros: row.costMicros,
      costBasis: row.costBasis ?? "unknown", sessions: row.sessions,
    })) };
  },
});
