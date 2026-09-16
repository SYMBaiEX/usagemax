import { bucketFields, eventBuckets, legacyEventBuckets } from "./tokenBuckets";
import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { DAY_MS, dayFromTimestamp } from "./lib";

type Usage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  unclassifiedTokens: number;
  totalTokens: number;
  costMicros: number;
  requests: number;
  errors: number;
};

const emptyUsage = (): Usage => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  reasoningTokens: 0,
  unclassifiedTokens: 0,
  totalTokens: 0,
  costMicros: 0,
  requests: 0,
  errors: 0,
});

function add(target: Usage, event: {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens?: number;
  reasoningTokens: number;
  totalTokens: number;
  costMicros: number;
  status: string;
  schemaVersion: number;
  bucketVersion?: number;
}) {
  const buckets = event.bucketVersion ? eventBuckets(event) : legacyEventBuckets(event);
  for (const field of bucketFields) target[field] += buckets[field];
  target.totalTokens += event.totalTokens;
  target.costMicros += event.costMicros;
  target.requests += 1;
  target.errors += event.status === "error" ? 1 : 0;
}

function subtract(current: number | undefined, amount: number, field: string) {
  const value = (current ?? 0) - amount;
  if (value < 0) throw new ConvexError(`DUPLICATE_REPAIR_UNDERFLOW:${field}`);
  return value;
}

function semanticEvent(event: {
  occurredAt: number;
  source: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens?: number;
  reasoningTokens: number;
  totalTokens: number;
  costMicros: number;
  costBasis?: string;
  status: string;
  completeness: string;
}) {
  return JSON.stringify([
    event.occurredAt,
    event.source,
    event.provider,
    event.model,
    event.inputTokens,
    event.outputTokens,
    event.cacheReadTokens,
    event.cacheWriteTokens ?? 0,
    event.reasoningTokens,
    event.totalTokens,
    event.costMicros,
    event.costBasis,
    event.status,
    event.completeness,
  ]);
}

async function collectorEvents(ctx: MutationCtx, collector: {
  _id: Id<"collectors">;
  profileId: Id<"profiles">;
  createdAt: number;
  lastSeenAt?: number;
}) {
  const receipts = (await ctx.db
    .query("ingestReceipts")
    .withIndex("by_createdAt", (q) =>
      q.gte("createdAt", collector.createdAt).lte("createdAt", (collector.lastSeenAt ?? collector.createdAt) + 10_000),
    )
    .collect()).filter((receipt) => receipt.collectorId === collector._id);
  if (!receipts.length) throw new ConvexError("DUPLICATE_REPAIR_NO_RECEIPTS");
  const rawIds = new Set(receipts.map((receipt) => /^cli:([^:]+):/.exec(receipt.batchId)?.[1]).filter(Boolean));
  if (rawIds.size !== 1) throw new ConvexError("DUPLICATE_REPAIR_AMBIGUOUS_IDENTITY");
  const rawId = [...rawIds][0]!;
  const receivedAt = new Set(receipts.map((receipt) => receipt.createdAt));
  const first = Math.min(...receivedAt);
  const last = Math.max(...receivedAt);
  const events = (await ctx.db
    .query("telemetryEvents")
    .withIndex("by_receivedAt", (q) => q.gte("receivedAt", first).lte("receivedAt", last))
    .collect()).filter((event) =>
      event.profileId === collector.profileId
      && receivedAt.has(event.receivedAt)
      && event.eventKey.startsWith(`ccusage-v1:${rawId}:`),
    );
  return { receipts, rawId, events };
}

function streaks(days: string[]) {
  const ordered = [...new Set(days)].sort();
  let longest = 0;
  let run = 0;
  let previous = Number.NaN;
  for (const day of ordered) {
    const index = Math.floor(Date.parse(`${day}T00:00:00.000Z`) / DAY_MS);
    run = index === previous + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = index;
  }
  return { current: run, longest };
}

/**
 * Remove one proven byte-for-byte semantic duplicate collector import.
 * The expected count/total and canonical comparison make this fail closed;
 * it is intentionally internal and cannot be called by a browser client.
 */
export const repairDuplicateCollector = internalMutation({
  args: {
    canonicalCollectorId: v.id("collectors"),
    duplicateCollectorId: v.id("collectors"),
    expectedEvents: v.number(),
    expectedTotalTokens: v.number(),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.canonicalCollectorId === args.duplicateCollectorId) throw new ConvexError("DUPLICATE_REPAIR_SAME_COLLECTOR");
    const canonical = await ctx.db.get(args.canonicalCollectorId);
    const duplicate = await ctx.db.get(args.duplicateCollectorId);
    if (!canonical || !duplicate || canonical.workspaceId !== duplicate.workspaceId || canonical.profileId !== duplicate.profileId) {
      throw new ConvexError("DUPLICATE_REPAIR_SCOPE_MISMATCH");
    }
    if (duplicate.revokedAt) throw new ConvexError("DUPLICATE_REPAIR_ALREADY_APPLIED");
    const canonicalData = await collectorEvents(ctx, canonical);
    const duplicateData = await collectorEvents(ctx, duplicate);
    const canonicalEvents = canonicalData.events.map(semanticEvent).sort();
    const duplicateEvents = duplicateData.events.map(semanticEvent).sort();
    if (
      duplicateEvents.length !== args.expectedEvents
      || canonicalEvents.length !== duplicateEvents.length
      || canonicalEvents.some((value, index) => value !== duplicateEvents[index])
    ) {
      throw new ConvexError("DUPLICATE_REPAIR_NOT_IDENTICAL");
    }
    if (duplicateData.events.some((event) => event.eventType !== "model_request" || event.sessionId)) {
      throw new ConvexError("DUPLICATE_REPAIR_UNSUPPORTED_EVENT");
    }

    const total = emptyUsage();
    const days = new Map<string, Usage>();
    const daily = new Map<string, Usage>();
    const sources = new Map<string, Usage>();
    const models = new Map<string, Usage>();
    for (const event of duplicateData.events) {
      add(total, event);
      const day = dayFromTimestamp(event.occurredAt);
      const dayUsage = days.get(day) ?? emptyUsage();
      add(dayUsage, event);
      days.set(day, dayUsage);
      const dailyKey = `${day}\u001f${event.source}\u001f${event.provider}\u001f${event.model}`;
      const dailyUsage = daily.get(dailyKey) ?? emptyUsage();
      add(dailyUsage, event);
      daily.set(dailyKey, dailyUsage);
      const sourceKey = `${day}\u001f${event.source}`;
      const sourceUsage = sources.get(sourceKey) ?? emptyUsage();
      add(sourceUsage, event);
      sources.set(sourceKey, sourceUsage);
      const modelKey = `${event.provider}\u001f${event.model}`;
      const modelUsage = models.get(modelKey) ?? emptyUsage();
      add(modelUsage, event);
      models.set(modelKey, modelUsage);
    }
    if (total.totalTokens !== args.expectedTotalTokens) throw new ConvexError("DUPLICATE_REPAIR_TOTAL_MISMATCH");

    for (const [key, usage] of daily) {
      const [day, source, provider, model] = key.split("\u001f");
      const row = await ctx.db
        .query("dailyUsage")
        .withIndex("by_profileId_and_day_and_source_and_provider_and_model", (q) =>
          q.eq("profileId", duplicate.profileId).eq("day", day).eq("source", source).eq("provider", provider).eq("model", model),
        )
        .unique();
      if (!row) throw new ConvexError("DUPLICATE_REPAIR_MISSING_DAILY_USAGE");
      await ctx.db.patch(row._id, {
        inputTokens: subtract(row.inputTokens, usage.inputTokens, "daily.input"),
        outputTokens: subtract(row.outputTokens, usage.outputTokens, "daily.output"),
        unclassifiedTokens: subtract(row.unclassifiedTokens, usage.unclassifiedTokens, "daily.unclassified"),
        cacheReadTokens: subtract(row.cacheReadTokens, usage.cacheReadTokens, "daily.cacheRead"),
        cacheWriteTokens: subtract(row.cacheWriteTokens, usage.cacheWriteTokens, "daily.cacheWrite"),
        reasoningTokens: subtract(row.reasoningTokens, usage.reasoningTokens, "daily.reasoning"),
        totalTokens: subtract(row.totalTokens, usage.totalTokens, "daily.total"),
        costMicros: subtract(row.costMicros, usage.costMicros, "daily.cost"),
        requests: subtract(row.requests, usage.requests, "daily.requests"),
        errors: subtract(row.errors, usage.errors, "daily.errors"),
        updatedAt: args.now,
      });
    }

    for (const [day, usage] of days) {
      const row = await ctx.db.query("profileDailyTotals").withIndex("by_profileId_and_day", (q) =>
        q.eq("profileId", duplicate.profileId).eq("day", day),
      ).unique();
      if (!row) throw new ConvexError("DUPLICATE_REPAIR_MISSING_DAY");
      await ctx.db.patch(row._id, {
        totalTokens: subtract(row.totalTokens, usage.totalTokens, "day.total"),
        outputTokens: subtract(row.outputTokens, usage.outputTokens, "day.output"),
        unclassifiedTokens: subtract(row.unclassifiedTokens, usage.unclassifiedTokens, "day.unclassified"),
        costMicros: subtract(row.costMicros, usage.costMicros, "day.cost"),
        requests: subtract(row.requests, usage.requests, "day.requests"),
        errors: subtract(row.errors, usage.errors, "day.errors"),
        updatedAt: args.now,
      });
    }

    for (const [key, usage] of sources) {
      const [day, source] = key.split("\u001f");
      const row = await ctx.db
        .query("dailyDimensions")
        .withIndex("by_profileId_and_dimension_and_day_and_key", (q) =>
          q.eq("profileId", duplicate.profileId).eq("dimension", "source").eq("day", day).eq("key", source),
        )
        .unique();
      if (!row) throw new ConvexError("DUPLICATE_REPAIR_MISSING_SOURCE");
      await ctx.db.patch(row._id, {
        outputTokens: subtract(row.outputTokens, usage.outputTokens, "source.output"),
        unclassifiedTokens: subtract(row.unclassifiedTokens, usage.unclassifiedTokens, "source.unclassified"),
        totalTokens: subtract(row.totalTokens, usage.totalTokens, "source.total"),
        costMicros: subtract(row.costMicros, usage.costMicros, "source.cost"),
        updatedAt: args.now,
      });
    }

    for (const [key, usage] of models) {
      const [provider, model] = key.split("\u001f");
      const row = await ctx.db.query("modelTotals").withIndex("by_profileId_and_provider_and_model", (q) =>
        q.eq("profileId", duplicate.profileId).eq("provider", provider).eq("model", model),
      ).unique();
      if (!row) throw new ConvexError("DUPLICATE_REPAIR_MISSING_MODEL");
      await ctx.db.patch(row._id, {
        totalTokens: subtract(row.totalTokens, usage.totalTokens, "model.total"),
        inputTokens: subtract(row.inputTokens, usage.inputTokens, "model.input"),
        outputTokens: subtract(row.outputTokens, usage.outputTokens, "model.output"),
        unclassifiedTokens: subtract(row.unclassifiedTokens, usage.unclassifiedTokens, "model.unclassified"),
        cacheReadTokens: subtract(row.cacheReadTokens, usage.cacheReadTokens, "model.cacheRead"),
        cacheWriteTokens: subtract(row.cacheWriteTokens, usage.cacheWriteTokens, "model.cacheWrite"),
        reasoningTokens: subtract(row.reasoningTokens, usage.reasoningTokens, "model.reasoning"),
        costMicros: subtract(row.costMicros, usage.costMicros, "model.cost"),
        requests: subtract(row.requests, usage.requests, "model.requests"),
        errors: subtract(row.errors, usage.errors, "model.errors"),
      });
    }

    const duplicateOrigin = `collector:${duplicate._id}`;
    const deviceRows = await ctx.db
      .query("dailyDimensions")
      .withIndex("by_profileId_and_origin_and_updatedAt", (q) => q.eq("profileId", duplicate.profileId).eq("origin", duplicateOrigin))
      .collect();
    if (deviceRows.reduce((sum, row) => sum + row.totalTokens, 0) !== total.totalTokens) {
      throw new ConvexError("DUPLICATE_REPAIR_DEVICE_TOTAL_MISMATCH");
    }
    for (const row of deviceRows) await ctx.db.delete(row._id);
    const profileDevice = await ctx.db
      .query("profileDevices")
      .withIndex("by_profileId_and_deviceHash", (q) => q.eq("profileId", duplicate.profileId).eq("deviceHash", String(duplicate._id)))
      .unique();
    if (!profileDevice) throw new ConvexError("DUPLICATE_REPAIR_MISSING_DEVICE");
    await ctx.db.delete(profileDevice._id);

    for (const event of duplicateData.events) await ctx.db.delete(event._id);
    for (const receipt of duplicateData.receipts) await ctx.db.delete(receipt._id);
    const rateBuckets = await ctx.db
      .query("ingestRateBuckets")
      .withIndex("by_collectorId_and_bucketStart", (q) => q.eq("collectorId", duplicate._id))
      .collect();
    for (const bucket of rateBuckets) await ctx.db.delete(bucket._id);
    const liveAgents = await ctx.db
      .query("agentLiveStats")
      .withIndex("by_profileId_and_updatedAt", (q) => q.eq("profileId", duplicate.profileId))
      .collect();
    for (const agent of liveAgents) {
      if (agent.externalId.startsWith(`${duplicateData.rawId}:`)) await ctx.db.delete(agent._id);
    }
    await ctx.db.patch(duplicate._id, {
      name: `${duplicate.name.slice(0, 56)} (duplicate removed)`,
      revokedAt: args.now,
      lastFailureAt: args.now,
      lastFailureCode: "duplicate_import_removed",
    });

    const stats = await ctx.db.query("profileStats").withIndex("by_profileId", (q) => q.eq("profileId", duplicate.profileId)).unique();
    if (!stats) throw new ConvexError("DUPLICATE_REPAIR_MISSING_STATS");
    const activityRows = await ctx.db
      .query("profileDailyTotals")
      .withIndex("by_profileId_and_day", (q) => q.eq("profileId", duplicate.profileId))
      .collect();
    const activeRows = activityRows.filter((row) => row.totalTokens > 0 || row.costMicros > 0);
    const streak = streaks(activeRows.map((row) => row.day));
    const peak = [...activeRows].sort((left, right) => right.costMicros - left.costMicros)[0];
    const devices = await ctx.db.query("profileDevices").withIndex("by_profileId", (q) => q.eq("profileId", duplicate.profileId)).collect();
    const leadingByCost = await ctx.db
      .query("modelTotals")
      .withIndex("by_profileId_and_costMicros", (q) => q.eq("profileId", duplicate.profileId))
      .order("desc")
      .first();
    const leadingModel = (leadingByCost?.costMicros ?? 0) > 0
      ? leadingByCost
      : await ctx.db.query("modelTotals").withIndex("by_profileId_and_totalTokens", (q) => q.eq("profileId", duplicate.profileId)).order("desc").first();
    const nextStats = {
      totalTokens: subtract(stats.totalTokens, total.totalTokens, "stats.total"),
      totalCostMicros: subtract(stats.totalCostMicros, total.costMicros, "stats.cost"),
      inputTokens: subtract(stats.inputTokens, total.inputTokens, "stats.input"),
      outputTokens: subtract(stats.outputTokens, total.outputTokens, "stats.output"),
        unclassifiedTokens: subtract(stats.unclassifiedTokens, total.unclassifiedTokens, "stats.unclassified"),
      cacheReadTokens: subtract(stats.cacheReadTokens, total.cacheReadTokens, "stats.cacheRead"),
      cacheWriteTokens: subtract(stats.cacheWriteTokens, total.cacheWriteTokens, "stats.cacheWrite"),
      reasoningTokens: subtract(stats.reasoningTokens, total.reasoningTokens, "stats.reasoning"),
      activeDays: activeRows.length,
      currentStreakDays: streak.current,
      longestStreakDays: streak.longest,
      deviceCount: devices.length,
      topModel: leadingModel?.model ?? "unknown",
      topModelProvider: leadingModel?.provider,
      topModelMetric: ((leadingByCost?.costMicros ?? 0) > 0 ? "spend" : "tokens") as "spend" | "tokens",
      firstDay: activeRows.map((row) => row.day).sort()[0],
      lastDay: activeRows.map((row) => row.day).sort().at(-1),
      peakDay: peak?.day,
      peakDayCostMicros: peak?.costMicros,
      avgCostPerActiveDayMicros: Math.round(subtract(stats.totalCostMicros, total.costMicros, "stats.avgCost") / Math.max(1, activeRows.length)),
      updatedAt: args.now,
    };
    await ctx.db.patch(stats._id, nextStats);

    const shard = [...String(duplicate._id)].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 128;
    const network = await ctx.db.query("networkCounterShards").withIndex("by_shard", (q) => q.eq("shard", shard)).unique();
    if (!network) throw new ConvexError("DUPLICATE_REPAIR_MISSING_NETWORK_SHARD");
    const eventDay = dayFromTimestamp(duplicateData.receipts[0].createdAt);
    await ctx.db.patch(network._id, {
      totalTokens: subtract(network.totalTokens, total.totalTokens, "network.total"),
      totalCostMicros: subtract(network.totalCostMicros, total.costMicros, "network.cost"),
      eventsToday: network.eventsDay === eventDay ? subtract(network.eventsToday, total.requests, "network.events") : network.eventsToday,
      updatedAt: args.now,
    });

    const profile = await ctx.db.get(duplicate.profileId);
    if (!profile) throw new ConvexError("DUPLICATE_REPAIR_MISSING_PROFILE");
    const thirtyCutoff = dayFromTimestamp(args.now - 29 * DAY_MS);
    const sevenCutoff = dayFromTimestamp(args.now - 6 * DAY_MS);
    const recent = activeRows.filter((row) => row.day >= thirtyCutoff);
    for (const period of ["all", "30d", "7d"] as const) {
      const periodRows = period === "all" ? activeRows : period === "30d" ? recent : recent.filter((row) => row.day >= sevenCutoff);
      const tokens = periodRows.reduce((sum, row) => sum + row.totalTokens, 0);
      const spend = periodRows.reduce((sum, row) => sum + row.costMicros, 0);
      for (const metric of ["tokens", "spend"] as const) {
        const row = await ctx.db
          .query("leaderboardEntries")
          .withIndex("by_profileId_and_period_and_metric", (q) =>
            q.eq("profileId", duplicate.profileId).eq("period", period).eq("metric", metric),
          )
          .unique();
        if (row) await ctx.db.patch(row._id, {
          score: metric === "tokens" ? tokens : spend,
          totalTokens: nextStats.totalTokens,
          totalCostMicros: nextStats.totalCostMicros,
          activeDays: nextStats.activeDays,
          updatedAt: args.now,
        });
      }
    }
    return { removedEvents: duplicateData.events.length, removedTokens: total.totalTokens, deviceCount: devices.length };
  },
});

/** Preview or atomically repair only bucket differences proven by retained raw events.
 * Costs, total tokens, sessions, receipts and raw provider counters never change.
 */
export const reconcileTokenBuckets = internalMutation({
  args: { handle: v.string(), dryRun: v.boolean(), expectedResidual: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const profile = await ctx.db.query("profiles").withIndex("by_handle", q => q.eq("handle", args.handle)).unique();
    if (!profile) throw new ConvexError("PROFILE_NOT_FOUND");
    const stats = await ctx.db.query("profileStats").withIndex("by_profileId", q => q.eq("profileId", profile._id)).unique();
    if (!stats) throw new ConvexError("STATS_NOT_FOUND");
    const events = await ctx.db.query("telemetryEvents").withIndex("by_profileId_and_occurredAt", q => q.eq("profileId", profile._id)).take(5001);
    if (events.length > 5000) throw new ConvexError("REPAIR_REQUIRES_PAGINATION");
    const empty = () => Object.fromEntries(bucketFields.map(f => [f, 0])) as Record<(typeof bucketFields)[number], number>;
    type Delta = ReturnType<typeof empty>;
    const total = empty();
    const daily = new Map<string, Delta>();
    const models = new Map<string, Delta>();
    const days = new Map<string, Delta>();
    const sources = new Map<string, Delta>();
    const devices = new Map<string, Delta>();
    const candidates = events.filter(e => e.eventType === "model_request" && e.accountingMode !== "observability" && !e.bucketVersion);
    let changedEvents = 0;
    for (const event of candidates) {
      const old = legacyEventBuckets(event), next = eventBuckets(event), delta = empty();
      for (const f of bucketFields) delta[f] = next[f] - old[f];
      if (!bucketFields.some(f => delta[f])) continue;
      changedEvents++;
      const day = dayFromTimestamp(event.occurredAt);
      const groups: Array<[Map<string, Delta>, string]> = [
        [daily, [day, event.source, event.provider, event.model].join("\u001f")],
        [models, [event.provider, event.model].join("\u001f")], [days, day],
        [sources, [day, event.source].join("\u001f")], [devices, [day, event.collectorId].join("\u001f")],
      ];
      for (const f of bucketFields) total[f] += delta[f];
      for (const [map, key] of groups) {
        const value = map.get(key) ?? empty();
        for (const f of bucketFields) value[f] += delta[f];
        map.set(key, value);
      }
    }
    const residual = bucketFields.reduce((sum, f) => sum + (stats[f] ?? 0), 0) - stats.totalTokens;
    const correction = bucketFields.reduce((sum, f) => sum + total[f], 0);
    const report = { retainedEvents: events.length, candidates: candidates.length, changedEvents, residual,
      correction, remainingResidual: residual + correction, categoryDelta: total };
    if (args.dryRun && residual + correction !== 0) return report;
    if (!args.dryRun && (args.expectedResidual === undefined || residual !== args.expectedResidual || residual + correction !== 0)) {
      throw new ConvexError("REPAIR_EVIDENCE_MISMATCH");
    }
    // Stage and validate every patch before writes. The transaction also guards
    // against a simultaneous snapshot correction invalidating our evidence.
    const patches: Array<{ id: Id<"dailyUsage"> | Id<"modelTotals"> | Id<"profileStats"> | Id<"profileDailyTotals"> | Id<"dailyDimensions">; value: Record<string, number> }> = [];
    const plan = (row: { _id: typeof patches[number]["id"]; totalTokens: number } & Partial<Delta> | null,
                  delta: Delta, full: boolean) => {
      if (!row) throw new ConvexError("REPAIR_PROJECTION_MISSING");
      const value: Record<string, number> = {};
      for (const f of full ? bucketFields : ["outputTokens", "unclassifiedTokens"] as const) {
        value[f] = (row[f] ?? 0) + delta[f];
        if (!Number.isSafeInteger(value[f]) || value[f] < 0) throw new ConvexError("REPAIR_PROJECTION_UNDERFLOW");
      }
      if (full && bucketFields.reduce((sum, f) => sum + value[f], 0) !== row.totalTokens) {
        throw new ConvexError("REPAIR_PROJECTION_MISMATCH");
      }
      patches.push({ id: row._id, value });
    };
    plan(stats, total, true);
    for (const [key, delta] of daily) {
      const [day, source, provider, model] = key.split("\u001f");
      plan(await ctx.db.query("dailyUsage").withIndex("by_profileId_and_day_and_source_and_provider_and_model", q =>
        q.eq("profileId", profile._id).eq("day", day).eq("source", source).eq("provider", provider).eq("model", model)).unique(), delta, true);
    }
    for (const [key, delta] of models) {
      const [provider, model] = key.split("\u001f");
      plan(await ctx.db.query("modelTotals").withIndex("by_profileId_and_provider_and_model", q =>
        q.eq("profileId", profile._id).eq("provider", provider).eq("model", model)).unique(), delta, true);
    }
    for (const [day, delta] of days) {
      if (!delta.outputTokens && !delta.unclassifiedTokens) continue;
      plan(await ctx.db.query("profileDailyTotals").withIndex("by_profileId_and_day", q => q.eq("profileId", profile._id).eq("day", day)).unique(), delta, false);
    }
    for (const [key, delta] of sources) {
      if (!delta.outputTokens && !delta.unclassifiedTokens) continue;
      const [day, source] = key.split("\u001f");
      plan(await ctx.db.query("dailyDimensions").withIndex("by_profileId_and_dimension_and_day_and_key", q =>
        q.eq("profileId", profile._id).eq("dimension", "source").eq("day", day).eq("key", source)).unique(), delta, false);
    }
    for (const [key, delta] of devices) {
      if (!delta.outputTokens && !delta.unclassifiedTokens) continue;
      const [day, collectorId] = key.split("\u001f");
      const rows = await ctx.db.query("dailyDimensions").withIndex("by_profileId_and_dimension_and_day_and_key", q =>
        q.eq("profileId", profile._id).eq("dimension", "device").eq("day", day)).take(101);
      const matches = rows.filter(row => row.origin === `collector:${collectorId}`);
      if (rows.length > 100 || matches.length !== 1) throw new ConvexError("REPAIR_DEVICE_AMBIGUOUS");
      plan(matches[0], delta, false);
    }
    if (args.dryRun) return { ...report, plannedRows: patches.length };
    for (const patch of patches) await ctx.db.patch(patch.id, patch.value);
    for (const event of candidates) await ctx.db.patch(event._id, { bucketVersion: 1 });
    return { ...report, patchedRows: patches.length };
  },
});
