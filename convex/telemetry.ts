import { bucketFields, eventBuckets } from "./tokenBuckets";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { DAY_MS, dayFromTimestamp } from "./lib";
import { enforceCollectorRateLimit } from "./rateLimits";
import { assertCollectorMembership } from "./collectorAccess";
import { ensureProfileDevice } from "./devices";

export const telemetryEventValidator = v.object({
  eventKey: v.string(),
  eventHash: v.string(),
  logicalRequestId: v.optional(v.string()),
  sessionId: v.optional(v.string()),
  agentExternalId: v.optional(v.string()),
  parentAgentExternalId: v.optional(v.string()),
  agentName: v.optional(v.string()),
  eventType: v.union(v.literal("model_request"), v.literal("tool_call"), v.literal("agent_state"), v.literal("outcome")),
  source: v.string(),
  provider: v.string(),
  requestedModel: v.optional(v.string()),
  model: v.string(),
  inputTokens: v.number(),
  outputTokens: v.number(),
  cacheReadTokens: v.number(),
  cacheWriteTokens: v.number(),
  reasoningTokens: v.number(),
  totalTokens: v.number(),
  costMicros: v.number(),
  costBasis: v.union(v.literal("reported"), v.literal("estimated"), v.literal("unknown")),
  pricingSource: v.optional(v.string()),
  pricingVersion: v.optional(v.string()),
  serviceTier: v.optional(v.string()),
  region: v.optional(v.string()),
  currency: v.optional(v.string()),
  projectId: v.optional(v.string()),
  costCenter: v.optional(v.string()),
  latencyMs: v.optional(v.number()),
  timeToFirstTokenMs: v.optional(v.number()),
  status: v.union(v.literal("ok"), v.literal("error"), v.literal("cancelled")),
  state: v.optional(v.string()),
  task: v.optional(v.string()),
  traceId: v.optional(v.string()),
  spanId: v.optional(v.string()),
  occurredAt: v.number(),
  schemaVersion: v.number(),
  completeness: v.union(v.literal("reported"), v.literal("estimated"), v.literal("unknown")),
});

type Event = typeof telemetryEventValidator.type;
type Rollup = {
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
  sessions: number;
  costBasisMask: number;
};

type AggregateCostBasis = "reported" | "estimated" | "api-equivalent" | "mixed" | "unknown";

const emptyRollup = (): Rollup => ({
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
  sessions: 0,
  costBasisMask: 0,
});

function addEvent(target: Rollup, event: Event) {
  const buckets = eventBuckets(event);
  for (const field of bucketFields) target[field] += buckets[field];
  target.totalTokens += event.totalTokens;
  target.costMicros += event.costMicros;
  const isAggregate = event.state === "synced" && event.pricingSource === "ccusage / LiteLLM";
  target.requests += event.eventType === "model_request" && !isAggregate ? 1 : 0;
  target.errors += event.status === "error" ? 1 : 0;
  target.costBasisMask |= event.costBasis === "reported" ? 1 : event.costBasis === "estimated" ? 2 : 4;
}

function aggregateCostBasis(mask: number): AggregateCostBasis | undefined {
  if (mask === 0) return undefined;
  if (mask === 1) return "reported";
  if (mask === 2) return "estimated";
  if (mask === 4) return "unknown";
  return "mixed";
}

function mergeCostBasis(
  prior: AggregateCostBasis | undefined,
  next: AggregateCostBasis | undefined,
): AggregateCostBasis | undefined {
  if (!next) return prior;
  if (!prior || prior === next) return next;
  return "mixed";
}

function streakMetrics(days: string[], now = Date.now()) {
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
  const latest = ordered.at(-1);
  const todayIndex = Math.floor(now / DAY_MS);
  const latestIndex = latest ? Math.floor(Date.parse(`${latest}T00:00:00.000Z`) / DAY_MS) : Number.NaN;
  return { current: todayIndex - latestIndex <= 1 ? run : 0, longest };
}

export const commitBatch = internalMutation({
  args: {
    keyHash: v.string(),
    batchId: v.string(),
    payloadHash: v.string(),
    receivedAt: v.number(),
    installationIdHash: v.optional(v.string()),
    events: v.array(telemetryEventValidator),
  },
  handler: async (ctx, args) => {
    const collector = await ctx.db.query("collectors").withIndex("by_keyHash", (q) => q.eq("keyHash", args.keyHash)).unique();
    if (!collector || collector.revokedAt || !collector.scopes.includes("telemetry:write")) throw new ConvexError("INVALID_COLLECTOR");
    await assertCollectorMembership(ctx, collector);
    if (collector.installationIdHash && args.installationIdHash && collector.installationIdHash !== args.installationIdHash) {
      throw new ConvexError("DEVICE_ID_MISMATCH");
    }
    if (!collector.installationIdHash && args.installationIdHash) {
      await ctx.db.patch(collector._id, { installationIdHash: args.installationIdHash });
    }
    if (args.events.some((event) => event.eventType === "outcome") && !collector.scopes.includes("outcomes:write")) {
      throw new ConvexError("INVALID_COLLECTOR_SCOPE");
    }

    const priorReceipt = await ctx.db
      .query("ingestReceipts")
      .withIndex("by_collectorId_and_batchId", (q) => q.eq("collectorId", collector._id).eq("batchId", args.batchId))
      .unique();
    if (priorReceipt) {
      if (priorReceipt.payloadHash !== args.payloadHash) throw new ConvexError("IDEMPOTENCY_CONFLICT");
      return { accepted: priorReceipt.accepted, duplicates: priorReceipt.duplicates, conflicts: 0, replay: true };
    }

    await enforceCollectorRateLimit(ctx, String(collector._id), args.events.length);

    const acceptedEvents: Event[] = [];
    let duplicates = 0;
    let conflicts = 0;
    for (const event of args.events) {
      const prior = await ctx.db
        .query("telemetryEvents")
        .withIndex("by_collectorId_and_eventKey", (q) => q.eq("collectorId", collector._id).eq("eventKey", event.eventKey))
        .unique();
      if (prior) {
        const versionOnlyUpgrade = prior.schemaVersion === 1 && event.schemaVersion === 2
          && Object.entries(event).every(([key, value]) => key === "eventHash" || key === "schemaVersion"
            || (prior as unknown as Record<string, unknown>)[key] === value);
        if (prior.eventHash === event.eventHash || versionOnlyUpgrade) duplicates += 1;
        else {
          conflicts += 1;
          await ctx.db.insert("quarantine", {
            workspaceId: collector.workspaceId,
            reason: "event_key_payload_conflict",
            reference: event.eventKey,
            receivedAt: args.receivedAt,
          });
        }
        continue;
      }
      await ctx.db.insert("telemetryEvents", {
        workspaceId: collector.workspaceId,
        profileId: collector.profileId,
        collectorId: collector._id,
        ...event,
        bucketVersion: 1,
        receivedAt: args.receivedAt,
      });
      acceptedEvents.push(event);
    }

    const dailyRollups = new Map<string, Rollup>();
    const dayRollups = new Map<string, Rollup>();
    const modelRollups = new Map<string, Rollup & { provider: string; lastUsedAt: number }>();
    const uniqueSessions = new Map<string, { day: string; dailyKey: string; sourceKey: string }>();
    const sourceRollups = new Map<string, Rollup>();
    const liveAgents = new Map<string, Event>();
    const total = emptyRollup();
    for (const event of acceptedEvents) {
      const day = dayFromTimestamp(event.occurredAt);
      if (event.eventType === "model_request") {
        addEvent(total, event);
        const dayTotal = dayRollups.get(day) ?? emptyRollup();
        addEvent(dayTotal, event);
        dayRollups.set(day, dayTotal);
        const dailyKey = `${day}\u001f${event.source}\u001f${event.provider}\u001f${event.model}`;
        const daily = dailyRollups.get(dailyKey) ?? emptyRollup();
        addEvent(daily, event);
        dailyRollups.set(dailyKey, daily);
        const sourceKey = `${day}\u001f${event.source}`;
        const sourceRollup = sourceRollups.get(sourceKey) ?? emptyRollup();
        addEvent(sourceRollup, event);
        sourceRollups.set(sourceKey, sourceRollup);
        const modelKey = `${event.provider}\u001f${event.model}`;
        const model = modelRollups.get(modelKey) ?? { ...emptyRollup(), provider: event.provider, lastUsedAt: event.occurredAt };
        addEvent(model, event);
        model.lastUsedAt = Math.max(model.lastUsedAt, event.occurredAt);
        modelRollups.set(modelKey, model);
        if (event.sessionId) uniqueSessions.set(event.sessionId, { day, dailyKey, sourceKey });
      }
      if (event.agentExternalId) {
        const previous = liveAgents.get(event.agentExternalId);
        if (!previous || previous.occurredAt <= event.occurredAt) liveAgents.set(event.agentExternalId, event);
      }
      if (event.eventType === "outcome" && event.logicalRequestId && ["accepted", "rejected", "abandoned", "retried"].includes(event.state ?? "")) {
        const priorOutcome = await ctx.db
          .query("outcomes")
          .withIndex("by_collectorId_and_eventKey", (q) => q.eq("collectorId", collector._id).eq("eventKey", event.eventKey))
          .unique();
        if (!priorOutcome) {
          await ctx.db.insert("outcomes", {
            workspaceId: collector.workspaceId,
            profileId: collector.profileId,
            collectorId: collector._id,
            eventKey: event.eventKey,
            logicalRequestId: event.logicalRequestId,
            outcome: event.state as "accepted" | "rejected" | "abandoned" | "retried",
            occurredAt: event.occurredAt,
            createdAt: args.receivedAt,
          });
        }
      }
    }

    for (const [externalId, event] of liveAgents) {
      const prior = await ctx.db
        .query("agentLiveStats")
        .withIndex("by_collectorId_and_externalId", (q) => q.eq("collectorId", collector._id).eq("externalId", externalId))
        .unique();
      const tokensPerSecond = event.latencyMs && event.latencyMs > 0 ? event.outputTokens / (event.latencyMs / 1000) : 0;
      const update = {
        parentExternalId: event.parentAgentExternalId,
        name: event.agentName ?? externalId,
        model: event.model,
        state: event.state ?? (event.status === "error" ? "error" : event.eventType === "tool_call" ? "tooling" : "running"),
        task: event.task,
        tokensPerSecond,
        totalTokens: (prior?.totalTokens ?? 0) + event.totalTokens,
        toolCalls: (prior?.toolCalls ?? 0) + (event.eventType === "tool_call" ? 1 : 0),
        errorCount: (prior?.errorCount ?? 0) + (event.status === "error" ? 1 : 0),
        sessionStartedAt: prior?.sessionStartedAt ?? event.occurredAt,
        updatedAt: event.occurredAt,
        expiresAt: event.occurredAt + 45_000,
        traceId: event.traceId,
      };
      if (prior) await ctx.db.patch(prior._id, update);
      else await ctx.db.insert("agentLiveStats", { workspaceId: collector.workspaceId, profileId: collector.profileId, collectorId: collector._id, externalId, ...update });
    }

    let newSessions = 0;
    const sessionsByDay = new Map<string, number>();
    const sessionsByDailyKey = new Map<string, number>();
    const sessionsBySourceKey = new Map<string, number>();
    for (const [sessionId, identity] of uniqueSessions) {
      const priorSession = await ctx.db
        .query("sessionReceipts")
        .withIndex("by_collectorId_and_source_and_sessionId", (q) =>
          q.eq("collectorId", collector._id).eq("source", identity.sourceKey.split("\u001f")[1]).eq("sessionId", sessionId),
        )
        .unique();
      if (!priorSession) {
        await ctx.db.insert("sessionReceipts", {
          workspaceId: collector.workspaceId,
          profileId: collector.profileId,
          collectorId: collector._id,
          source: identity.sourceKey.split("\u001f")[1],
          sessionId,
          firstSeenAt: args.receivedAt,
        });
        newSessions += 1;
        sessionsByDay.set(identity.day, (sessionsByDay.get(identity.day) ?? 0) + 1);
        sessionsByDailyKey.set(identity.dailyKey, (sessionsByDailyKey.get(identity.dailyKey) ?? 0) + 1);
        sessionsBySourceKey.set(identity.sourceKey, (sessionsBySourceKey.get(identity.sourceKey) ?? 0) + 1);
      }
    }

    // Non-accounting enterprise events are retained for bounded private
    // analysis, but they do not invalidate public usage projections.
    if (dailyRollups.size > 0) {
      const existingDays = new Set<string>();
      const uniqueDays = new Set([...dailyRollups.keys()].map((key) => key.split("\u001f")[0]));
      for (const day of uniqueDays) {
        const prior = await ctx.db
          .query("dailyUsage")
          .withIndex("by_profileId_and_day", (q) => q.eq("profileId", collector.profileId).eq("day", day))
          .first();
        if (prior) existingDays.add(day);
      }

    for (const [key, rollup] of dailyRollups) {
      const [day, source, provider, model] = key.split("\u001f");
      const prior = await ctx.db
        .query("dailyUsage")
        .withIndex("by_profileId_and_day_and_source_and_provider_and_model", (q) =>
          q.eq("profileId", collector.profileId).eq("day", day).eq("source", source).eq("provider", provider).eq("model", model),
        )
        .unique();
      const update = {
        inputTokens: (prior?.inputTokens ?? 0) + rollup.inputTokens,
        outputTokens: (prior?.outputTokens ?? 0) + rollup.outputTokens,
        cacheReadTokens: (prior?.cacheReadTokens ?? 0) + rollup.cacheReadTokens,
        cacheWriteTokens: (prior?.cacheWriteTokens ?? 0) + rollup.cacheWriteTokens,
        reasoningTokens: (prior?.reasoningTokens ?? 0) + rollup.reasoningTokens,
        unclassifiedTokens: (prior?.unclassifiedTokens ?? 0) + rollup.unclassifiedTokens,
        totalTokens: (prior?.totalTokens ?? 0) + rollup.totalTokens,
        costMicros: (prior?.costMicros ?? 0) + rollup.costMicros,
        costBasis: mergeCostBasis(prior?.costBasis, aggregateCostBasis(rollup.costBasisMask)),
        sessions: (prior?.sessions ?? 0) + (sessionsByDailyKey.get(key) ?? 0),
        requests: (prior?.requests ?? 0) + rollup.requests,
        errors: (prior?.errors ?? 0) + rollup.errors,
        updatedAt: args.receivedAt,
      };
      if (prior) await ctx.db.patch(prior._id, update);
      else await ctx.db.insert("dailyUsage", { workspaceId: collector.workspaceId, profileId: collector.profileId, day, source, provider, model, ...update });
    }

    for (const [day, rollup] of dayRollups) {
      const prior = await ctx.db
        .query("profileDailyTotals")
        .withIndex("by_profileId_and_day", (q) => q.eq("profileId", collector.profileId).eq("day", day))
        .unique();
      const update = {
        totalTokens: (prior?.totalTokens ?? 0) + rollup.totalTokens,
        outputTokens: (prior?.outputTokens ?? 0) + rollup.outputTokens,
        unclassifiedTokens: (prior?.unclassifiedTokens ?? 0) + rollup.unclassifiedTokens,
        costMicros: (prior?.costMicros ?? 0) + rollup.costMicros,
        costBasis: mergeCostBasis(prior?.costBasis, aggregateCostBasis(rollup.costBasisMask)),
        sessions: (prior?.sessions ?? 0) + (sessionsByDay.get(day) ?? 0),
        requests: (prior?.requests ?? 0) + rollup.requests,
        errors: (prior?.errors ?? 0) + rollup.errors,
        updatedAt: args.receivedAt,
      };
      if (prior) await ctx.db.patch(prior._id, update);
      else {
        await ctx.db.insert("profileDailyTotals", {
          workspaceId: collector.workspaceId,
          profileId: collector.profileId,
          day,
          ...update,
        });
      }
    }

    const deviceHash = args.installationIdHash ?? collector.installationIdHash ?? String(collector._id);
    const deviceLabel = await ensureProfileDevice(ctx, { ...collector, installationIdHash: args.installationIdHash ?? collector.installationIdHash }, args.receivedAt);

    for (const [key, rollup] of sourceRollups) {
      const [day, source] = key.split("\u001f");
      const prior = await ctx.db
        .query("dailyDimensions")
        .withIndex("by_profileId_and_dimension_and_day_and_key", (q) =>
          q.eq("profileId", collector.profileId).eq("dimension", "source").eq("day", day).eq("key", source),
        )
        .unique();
      const update = {
        outputTokens: (prior?.outputTokens ?? 0) + rollup.outputTokens,
        unclassifiedTokens: (prior?.unclassifiedTokens ?? 0) + rollup.unclassifiedTokens,
        totalTokens: (prior?.totalTokens ?? 0) + rollup.totalTokens,
        costMicros: (prior?.costMicros ?? 0) + rollup.costMicros,
        costBasis: mergeCostBasis(prior?.costBasis, aggregateCostBasis(rollup.costBasisMask)) ?? "unknown",
        sessions: (prior?.sessions ?? 0) + (sessionsBySourceKey.get(key) ?? 0),
        updatedAt: args.receivedAt,
      };
      if (prior) await ctx.db.patch(prior._id, update);
      else await ctx.db.insert("dailyDimensions", {
        workspaceId: collector.workspaceId,
        profileId: collector.profileId,
        day,
        dimension: "source",
        key: source,
        origin: "first-party",
        ...update,
      });
    }

    for (const [day, rollup] of dayRollups) {
      const prior = await ctx.db
        .query("dailyDimensions")
        .withIndex("by_profileId_and_dimension_and_day_and_key", (q) =>
          q.eq("profileId", collector.profileId).eq("dimension", "device").eq("day", day).eq("key", deviceLabel!),
        )
        .unique();
      const update = {
        outputTokens: (prior?.outputTokens ?? 0) + rollup.outputTokens,
        unclassifiedTokens: (prior?.unclassifiedTokens ?? 0) + rollup.unclassifiedTokens,
        totalTokens: (prior?.totalTokens ?? 0) + rollup.totalTokens,
        costMicros: (prior?.costMicros ?? 0) + rollup.costMicros,
        costBasis: mergeCostBasis(prior?.costBasis, aggregateCostBasis(rollup.costBasisMask)) ?? "unknown",
        sessions: (prior?.sessions ?? 0) + (sessionsByDay.get(day) ?? 0),
        updatedAt: args.receivedAt,
      };
      if (prior) await ctx.db.patch(prior._id, update);
      else await ctx.db.insert("dailyDimensions", {
        workspaceId: collector.workspaceId,
        profileId: collector.profileId,
        day,
        dimension: "device",
        key: deviceLabel!,
        keyHash: deviceHash,
        origin: `collector:${collector._id}`,
        ...update,
      });
    }

    for (const [modelKey, rollup] of modelRollups) {
      const [, modelName] = modelKey.split("\u001f");
      const prior = await ctx.db
        .query("modelTotals")
        .withIndex("by_profileId_and_provider_and_model", (q) =>
          q.eq("profileId", collector.profileId).eq("provider", rollup.provider).eq("model", modelName),
        )
        .unique();
      const update = {
        provider: rollup.provider,
        totalTokens: (prior?.totalTokens ?? 0) + rollup.totalTokens,
        inputTokens: (prior?.inputTokens ?? 0) + rollup.inputTokens,
        outputTokens: (prior?.outputTokens ?? 0) + rollup.outputTokens,
        cacheReadTokens: (prior?.cacheReadTokens ?? 0) + rollup.cacheReadTokens,
        cacheWriteTokens: (prior?.cacheWriteTokens ?? 0) + rollup.cacheWriteTokens,
        reasoningTokens: (prior?.reasoningTokens ?? 0) + rollup.reasoningTokens,
        unclassifiedTokens: (prior?.unclassifiedTokens ?? 0) + rollup.unclassifiedTokens,
        costMicros: (prior?.costMicros ?? 0) + rollup.costMicros,
        costBasis: mergeCostBasis(prior?.costBasis, aggregateCostBasis(rollup.costBasisMask)),
        requests: (prior?.requests ?? 0) + rollup.requests,
        errors: (prior?.errors ?? 0) + rollup.errors,
        lastUsedAt: Math.max(prior?.lastUsedAt ?? 0, rollup.lastUsedAt),
      };
      if (prior) await ctx.db.patch(prior._id, update);
      else await ctx.db.insert("modelTotals", { workspaceId: collector.workspaceId, profileId: collector.profileId, model: modelName, ...update });
    }

    const stats = await ctx.db.query("profileStats").withIndex("by_profileId", (q) => q.eq("profileId", collector.profileId)).unique();
    const leadingByCost = await ctx.db
      .query("modelTotals")
      .withIndex("by_profileId_and_costMicros", (q) => q.eq("profileId", collector.profileId))
      .order("desc")
      .first();
    const leadingModel = (leadingByCost?.costMicros ?? 0) > 0
      ? leadingByCost
      : await ctx.db.query("modelTotals").withIndex("by_profileId_and_totalTokens", (q) => q.eq("profileId", collector.profileId)).order("desc").first();
    const uniqueNewDays = [...uniqueDays].filter((day) => !existingDays.has(day)).length;
    const eventDays = [...uniqueDays].sort();
    const activityRows = await ctx.db
      .query("profileDailyTotals")
      .withIndex("by_profileId_and_day", (q) => q.eq("profileId", collector.profileId))
      .order("desc")
      .take(730);
    const streaks = streakMetrics(activityRows.filter((row) => row.totalTokens > 0).map((row) => row.day), args.receivedAt);
    const bestRecentDay = [...activityRows].sort((left, right) => right.costMicros - left.costMicros)[0];
    const priorPeakWins = (stats?.peakDayCostMicros ?? -1) > (bestRecentDay?.costMicros ?? -1);
    const lastEventAt = acceptedEvents.reduce((max, event) => Math.max(max, event.occurredAt), stats?.lastEventAt ?? 0);
    const firstDay = [stats?.firstDay, eventDays[0]].filter((value): value is string => Boolean(value)).sort()[0];
    const lastDay = [stats?.lastDay, eventDays.at(-1)].filter((value): value is string => Boolean(value)).sort().at(-1);
    const acceptedUsageSources = acceptedEvents
      .filter((event) => event.eventType === "model_request")
      .map((event) => event.source);
    const nextStats = {
      totalTokens: (stats?.totalTokens ?? 0) + total.totalTokens,
      totalCostMicros: (stats?.totalCostMicros ?? 0) + total.costMicros,
      inputTokens: (stats?.inputTokens ?? 0) + total.inputTokens,
      outputTokens: (stats?.outputTokens ?? 0) + total.outputTokens,
      cacheReadTokens: (stats?.cacheReadTokens ?? 0) + total.cacheReadTokens,
      cacheWriteTokens: (stats?.cacheWriteTokens ?? 0) + total.cacheWriteTokens,
      reasoningTokens: (stats?.reasoningTokens ?? 0) + total.reasoningTokens,
      unclassifiedTokens: (stats?.unclassifiedTokens ?? 0) + total.unclassifiedTokens,
      costBasis: mergeCostBasis(stats?.costBasis, aggregateCostBasis(total.costBasisMask)),
      costSource: total.costBasisMask === 0
        ? stats?.costSource
        : stats?.totalTokens
          ? "multiple-sources"
          : "collector",
      sources: [...new Set([...(stats?.sources ?? []), ...acceptedUsageSources])].sort(),
      sessions: (stats?.sessions ?? 0) + newSessions,
      activeDays: (stats?.activeDays ?? 0) + uniqueNewDays,
      currentStreakDays: streaks.current,
      longestStreakDays: Math.max(stats?.longestStreakDays ?? 0, streaks.longest),
      deviceCount: stats?.deviceCount ?? 1,
      topModel: leadingModel?.model ?? stats?.topModel ?? modelRollups.keys().next().value ?? "unknown",
      topModelProvider: leadingModel?.provider,
      topModelMetric: ((leadingByCost?.costMicros ?? 0) > 0 ? "spend" : "tokens") as "spend" | "tokens",
      firstDay,
      lastDay,
      lastEventAt: lastEventAt || undefined,
      peakDay: priorPeakWins ? stats?.peakDay : bestRecentDay?.day,
      peakDayCostMicros: priorPeakWins ? stats?.peakDayCostMicros : bestRecentDay?.costMicros,
      avgCostPerActiveDayMicros: Math.round(((stats?.totalCostMicros ?? 0) + total.costMicros) / Math.max(1, (stats?.activeDays ?? 0) + uniqueNewDays)),
      lastSyncAt: args.receivedAt,
      syncStatus: "healthy" as const,
      syncErrorCode: undefined,
      updatedAt: args.receivedAt,
    };
    if (stats) await ctx.db.patch(stats._id, nextStats);
    else await ctx.db.insert("profileStats", { workspaceId: collector.workspaceId, profileId: collector.profileId, ...nextStats });

    const profile = await ctx.db.get(collector.profileId);
    if (profile) {
      const thirtyCutoff = dayFromTimestamp(args.receivedAt - 29 * DAY_MS);
      const sevenCutoff = dayFromTimestamp(args.receivedAt - 6 * DAY_MS);
      const recentDays = await ctx.db
        .query("profileDailyTotals")
        .withIndex("by_profileId_and_day", (q) => q.eq("profileId", collector.profileId).gte("day", thirtyCutoff))
        .collect();
      const periodScores = [
        { period: "all" as const, tokens: nextStats.totalTokens, spend: nextStats.totalCostMicros },
        {
          period: "30d" as const,
          tokens: recentDays.reduce((sum, row) => sum + row.totalTokens, 0),
          spend: recentDays.reduce((sum, row) => sum + row.costMicros, 0),
        },
        {
          period: "7d" as const,
          tokens: recentDays.filter((row) => row.day >= sevenCutoff).reduce((sum, row) => sum + row.totalTokens, 0),
          spend: recentDays.filter((row) => row.day >= sevenCutoff).reduce((sum, row) => sum + row.costMicros, 0),
        },
      ];
      for (const periodScore of periodScores) {
        for (const metric of ["tokens", "spend"] as const) {
          const prior = await ctx.db
            .query("leaderboardEntries")
            .withIndex("by_profileId_and_period_and_metric", (q) =>
              q.eq("profileId", collector.profileId).eq("period", periodScore.period).eq("metric", metric),
            )
            .unique();
          const update = {
            handle: profile.handle,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
            verification: profile.verification,
            score: metric === "tokens" ? periodScore.tokens : periodScore.spend,
            totalTokens: nextStats.totalTokens,
            totalCostMicros: nextStats.totalCostMicros,
            costBasis: nextStats.costBasis,
            sessions: nextStats.sessions,
            activeDays: nextStats.activeDays,
            lastEventAt: nextStats.lastEventAt,
            isPublic: profile.isPublic,
            updatedAt: args.receivedAt,
          };
          if (prior) await ctx.db.patch(prior._id, update);
          else await ctx.db.insert("leaderboardEntries", {
            workspaceId: collector.workspaceId,
            profileId: collector.profileId,
            period: periodScore.period,
            metric,
            ...update,
          });
        }
      }
      }

    const shard = [...String(collector._id)].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 128;
    const eventsDay = dayFromTimestamp(args.receivedAt);
    const network = await ctx.db
      .query("networkCounterShards")
      .withIndex("by_shard", (q) => q.eq("shard", shard))
      .unique();
    if (network) {
      await ctx.db.patch(network._id, {
        totalTokens: network.totalTokens + total.totalTokens,
        totalCostMicros: network.totalCostMicros + total.costMicros,
        totalSessions: network.totalSessions + newSessions,
        eventsDay,
        eventsToday: network.eventsDay === eventsDay ? network.eventsToday + total.requests : total.requests,
        updatedAt: args.receivedAt,
      });
    } else {
      await ctx.db.insert("networkCounterShards", {
        shard,
        totalTokens: total.totalTokens,
        totalCostMicros: total.costMicros,
        totalSessions: newSessions,
        profiles: 0,
        eventsDay,
        eventsToday: total.requests,
        updatedAt: args.receivedAt,
      });
    }
    }

    await ctx.db.patch(collector._id, { lastSeenAt: args.receivedAt, lastSuccessAt: args.receivedAt });
    await ctx.db.insert("ingestReceipts", {
      workspaceId: collector.workspaceId,
      collectorId: collector._id,
      batchId: args.batchId,
      payloadHash: args.payloadHash,
      accepted: acceptedEvents.length,
      duplicates,
      createdAt: args.receivedAt,
    });
    return { accepted: acceptedEvents.length, duplicates, conflicts, replay: false };
  },
});

export const deleteExpired = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ events: number; receipts: number; snapshotReceipts: number; snapshotRuns: number; staleRuns: number; rateBuckets: number; liveAgents: number; quarantine: number; deviceLinks: number; workosReceipts: number }> => {
    const now = Date.now();
    const batchSize = 250;
    const expiredGroups = await ctx.db.query("snapshotChunkGroups").withIndex("by_updatedAt", q => q.lt("updatedAt", now - 180 * DAY_MS)).take(batchSize);
    for (const group of expiredGroups) await ctx.db.delete(group._id);
    const [events, receipts, snapshotReceipts, completedRuns, failedRuns, uploadingRuns, scanningRuns, rateBuckets, liveAgents, quarantine, deviceLinks, workosReceipts] = await Promise.all([
      // Workspace-aware retention runs separately; never override a contracted window.
      Promise.resolve([] as Doc<"telemetryEvents">[]),
      ctx.db
        .query("ingestReceipts")
        .withIndex("by_createdAt", (q) => q.lt("createdAt", now - 90 * DAY_MS))
        .take(batchSize),
      ctx.db
        .query("snapshotReceipts")
        .withIndex("by_createdAt", (q) => q.lt("createdAt", now - 90 * DAY_MS))
        .take(batchSize),
      ctx.db
        .query("snapshotRuns")
        .withIndex("by_status_and_updatedAt", (q) => q.eq("status", "complete").lt("updatedAt", now - 180 * DAY_MS))
        .take(batchSize),
      ctx.db
        .query("snapshotRuns")
        .withIndex("by_status_and_updatedAt", (q) => q.eq("status", "failed").lt("updatedAt", now - 90 * DAY_MS))
        .take(batchSize),
      ctx.db
        .query("snapshotRuns")
        .withIndex("by_status_and_updatedAt", (q) => q.eq("status", "uploading").lt("updatedAt", now - 30 * DAY_MS))
        .take(batchSize),
      ctx.db
        .query("snapshotRuns")
        .withIndex("by_status_and_updatedAt", (q) => q.eq("status", "scanning").lt("updatedAt", now - 30 * DAY_MS))
        .take(batchSize),
      ctx.db
        .query("ingestRateBuckets")
        .withIndex("by_bucketStart", (q) => q.lt("bucketStart", now - 2 * DAY_MS))
        .take(batchSize),
      ctx.db
        .query("agentLiveStats")
        .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now - DAY_MS))
        .take(batchSize),
      ctx.db
        .query("quarantine")
        .withIndex("by_receivedAt", (q) => q.lt("receivedAt", now - 30 * DAY_MS))
        .take(batchSize),
      ctx.db
        .query("deviceLinkCodes")
        .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now - DAY_MS))
        .take(batchSize),
      ctx.db
        .query("workosEventReceipts")
        .withIndex("by_createdAt", (q) => q.lt("createdAt", now - 90 * DAY_MS))
        .take(batchSize),
    ]);
    for (const event of events) await ctx.db.delete(event._id);
    for (const receipt of receipts) await ctx.db.delete(receipt._id);
    for (const receipt of snapshotReceipts) await ctx.db.delete(receipt._id);
    for (const run of [...completedRuns, ...failedRuns]) await ctx.db.delete(run._id);
    for (const run of [...uploadingRuns, ...scanningRuns]) {
      await ctx.db.patch(run._id, { status: "failed", failureCode: "snapshot_run_expired", updatedAt: now });
      const collector = await ctx.db.get(run.collectorId);
      if (collector && collector.lastSyncRunId === run.runId) {
        await ctx.db.patch(collector._id, { lastSyncPhase: "failed", lastFailureAt: now, lastFailureCode: "snapshot_run_expired" });
      }
    }
    for (const bucket of rateBuckets) await ctx.db.delete(bucket._id);
    for (const agent of liveAgents) await ctx.db.delete(agent._id);
    for (const row of quarantine) await ctx.db.delete(row._id);
    for (const link of deviceLinks) await ctx.db.delete(link._id);
    for (const receipt of workosReceipts) await ctx.db.delete(receipt._id);
    const snapshotRuns = completedRuns.length + failedRuns.length;
    const staleRuns = uploadingRuns.length + scanningRuns.length;
    if ([expiredGroups, events, receipts, snapshotReceipts, completedRuns, failedRuns, uploadingRuns, scanningRuns, rateBuckets, liveAgents, quarantine, deviceLinks, workosReceipts].some((rows) => rows.length === batchSize)) {
      await ctx.scheduler.runAfter(0, internal.telemetry.deleteExpired, {});
    }
    return {
      events: events.length,
      receipts: receipts.length,
      snapshotReceipts: snapshotReceipts.length,
      snapshotRuns,
      staleRuns,
      rateBuckets: rateBuckets.length,
      liveAgents: liveAgents.length,
      workosReceipts: workosReceipts.length,
      quarantine: quarantine.length,
      deviceLinks: deviceLinks.length,
    };
  },
});
