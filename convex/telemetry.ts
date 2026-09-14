import { ConvexError, v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { DAY_MS, dayFromTimestamp } from "./lib";

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
  reasoningTokens: v.number(),
  totalTokens: v.number(),
  costMicros: v.number(),
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
  reasoningTokens: number;
  totalTokens: number;
  costMicros: number;
  requests: number;
  errors: number;
  sessions: number;
};

const emptyRollup = (): Rollup => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  reasoningTokens: 0,
  totalTokens: 0,
  costMicros: 0,
  requests: 0,
  errors: 0,
  sessions: 0,
});

function addEvent(target: Rollup, event: Event) {
  target.inputTokens += event.inputTokens;
  target.outputTokens += event.outputTokens;
  target.cacheReadTokens += event.cacheReadTokens;
  target.reasoningTokens += event.reasoningTokens;
  target.totalTokens += event.totalTokens;
  target.costMicros += event.costMicros;
  target.requests += event.eventType === "model_request" ? 1 : 0;
  target.errors += event.status === "error" ? 1 : 0;
}

export const commitBatch = internalMutation({
  args: {
    keyHash: v.string(),
    batchId: v.string(),
    payloadHash: v.string(),
    receivedAt: v.number(),
    events: v.array(telemetryEventValidator),
  },
  handler: async (ctx, args) => {
    const collector = await ctx.db.query("collectors").withIndex("by_keyHash", (q) => q.eq("keyHash", args.keyHash)).unique();
    if (!collector || collector.revokedAt) throw new ConvexError("INVALID_COLLECTOR");

    const priorReceipt = await ctx.db
      .query("ingestReceipts")
      .withIndex("by_workspaceId_and_batchId", (q) => q.eq("workspaceId", collector.workspaceId).eq("batchId", args.batchId))
      .unique();
    if (priorReceipt) {
      if (priorReceipt.payloadHash !== args.payloadHash) throw new ConvexError("IDEMPOTENCY_CONFLICT");
      return { accepted: priorReceipt.accepted, duplicates: priorReceipt.duplicates, conflicts: 0, replay: true };
    }

    const bucketStart = Math.floor(args.receivedAt / 60_000) * 60_000;
    const rateBucket = await ctx.db
      .query("ingestRateBuckets")
      .withIndex("by_collectorId_and_bucketStart", (q) => q.eq("collectorId", collector._id).eq("bucketStart", bucketStart))
      .unique();
    const nextRequests = (rateBucket?.requests ?? 0) + 1;
    const nextEvents = (rateBucket?.events ?? 0) + args.events.length;
    if (nextRequests > 120 || nextEvents > 5_000) throw new ConvexError("RATE_LIMITED");
    if (rateBucket) await ctx.db.patch(rateBucket._id, { requests: nextRequests, events: nextEvents });
    else await ctx.db.insert("ingestRateBuckets", { collectorId: collector._id, bucketStart, requests: 1, events: args.events.length });

    const acceptedEvents: Event[] = [];
    let duplicates = 0;
    let conflicts = 0;
    for (const event of args.events) {
      const prior = await ctx.db
        .query("telemetryEvents")
        .withIndex("by_workspaceId_and_eventKey", (q) => q.eq("workspaceId", collector.workspaceId).eq("eventKey", event.eventKey))
        .unique();
      if (prior) {
        if (prior.eventHash === event.eventHash) duplicates += 1;
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
        ...event,
        receivedAt: args.receivedAt,
      });
      acceptedEvents.push(event);
    }

    const dailyRollups = new Map<string, Rollup>();
    const modelRollups = new Map<string, Rollup & { provider: string; lastUsedAt: number }>();
    const uniqueSessions = new Map<string, string>();
    const liveAgents = new Map<string, Event>();
    const total = emptyRollup();
    for (const event of acceptedEvents) {
      addEvent(total, event);
      const day = dayFromTimestamp(event.occurredAt);
      const dailyKey = `${day}\u001f${event.source}\u001f${event.model}`;
      const daily = dailyRollups.get(dailyKey) ?? emptyRollup();
      addEvent(daily, event);
      dailyRollups.set(dailyKey, daily);
      const model = modelRollups.get(event.model) ?? { ...emptyRollup(), provider: event.provider, lastUsedAt: event.occurredAt };
      addEvent(model, event);
      model.lastUsedAt = Math.max(model.lastUsedAt, event.occurredAt);
      modelRollups.set(event.model, model);
      if (event.sessionId) uniqueSessions.set(event.sessionId, day);
      if (event.agentExternalId) {
        const previous = liveAgents.get(event.agentExternalId);
        if (!previous || previous.occurredAt <= event.occurredAt) liveAgents.set(event.agentExternalId, event);
      }
      if (event.eventType === "outcome" && event.logicalRequestId && ["accepted", "rejected", "abandoned", "retried"].includes(event.state ?? "")) {
        const priorOutcome = await ctx.db
          .query("outcomes")
          .withIndex("by_workspaceId_and_eventKey", (q) => q.eq("workspaceId", collector.workspaceId).eq("eventKey", event.eventKey))
          .unique();
        if (!priorOutcome) {
          await ctx.db.insert("outcomes", {
            workspaceId: collector.workspaceId,
            profileId: collector.profileId,
            eventKey: event.eventKey,
            logicalRequestId: event.logicalRequestId,
            outcome: event.state as "accepted" | "rejected" | "abandoned" | "retried",
            occurredAt: event.occurredAt,
            createdAt: args.receivedAt,
          });
        }
      }
    }

    let newSessions = 0;
    const sessionsByDay = new Map<string, number>();
    for (const [sessionId, day] of uniqueSessions) {
      const priorSession = await ctx.db
        .query("sessionReceipts")
        .withIndex("by_workspaceId_and_sessionId", (q) => q.eq("workspaceId", collector.workspaceId).eq("sessionId", sessionId))
        .unique();
      if (!priorSession) {
        await ctx.db.insert("sessionReceipts", {
          workspaceId: collector.workspaceId,
          profileId: collector.profileId,
          sessionId,
          firstSeenAt: args.receivedAt,
        });
        newSessions += 1;
        sessionsByDay.set(day, (sessionsByDay.get(day) ?? 0) + 1);
      }
    }

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
      const [day, source, model] = key.split("\u001f");
      const provider = acceptedEvents.find((event) => dayFromTimestamp(event.occurredAt) === day && event.source === source && event.model === model)?.provider ?? "unknown";
      const prior = await ctx.db
        .query("dailyUsage")
        .withIndex("by_profileId_and_day_and_source_and_model", (q) =>
          q.eq("profileId", collector.profileId).eq("day", day).eq("source", source).eq("model", model),
        )
        .unique();
      const update = {
        inputTokens: (prior?.inputTokens ?? 0) + rollup.inputTokens,
        outputTokens: (prior?.outputTokens ?? 0) + rollup.outputTokens,
        cacheReadTokens: (prior?.cacheReadTokens ?? 0) + rollup.cacheReadTokens,
        reasoningTokens: (prior?.reasoningTokens ?? 0) + rollup.reasoningTokens,
        totalTokens: (prior?.totalTokens ?? 0) + rollup.totalTokens,
        costMicros: (prior?.costMicros ?? 0) + rollup.costMicros,
        sessions: (prior?.sessions ?? 0) + (sessionsByDay.get(day) ?? 0),
        requests: (prior?.requests ?? 0) + rollup.requests,
        errors: (prior?.errors ?? 0) + rollup.errors,
        updatedAt: args.receivedAt,
      };
      if (prior) await ctx.db.patch(prior._id, update);
      else await ctx.db.insert("dailyUsage", { workspaceId: collector.workspaceId, profileId: collector.profileId, day, source, provider, model, ...update });
    }

    for (const [modelName, rollup] of modelRollups) {
      const prior = await ctx.db
        .query("modelTotals")
        .withIndex("by_profileId_and_model", (q) => q.eq("profileId", collector.profileId).eq("model", modelName))
        .unique();
      const update = {
        provider: rollup.provider,
        totalTokens: (prior?.totalTokens ?? 0) + rollup.totalTokens,
        inputTokens: (prior?.inputTokens ?? 0) + rollup.inputTokens,
        outputTokens: (prior?.outputTokens ?? 0) + rollup.outputTokens,
        costMicros: (prior?.costMicros ?? 0) + rollup.costMicros,
        requests: (prior?.requests ?? 0) + rollup.requests,
        errors: (prior?.errors ?? 0) + rollup.errors,
        lastUsedAt: Math.max(prior?.lastUsedAt ?? 0, rollup.lastUsedAt),
      };
      if (prior) await ctx.db.patch(prior._id, update);
      else await ctx.db.insert("modelTotals", { workspaceId: collector.workspaceId, profileId: collector.profileId, model: modelName, ...update });
    }

    for (const [externalId, event] of liveAgents) {
      const prior = await ctx.db
        .query("agentLiveStats")
        .withIndex("by_workspaceId_and_externalId", (q) => q.eq("workspaceId", collector.workspaceId).eq("externalId", externalId))
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
      else await ctx.db.insert("agentLiveStats", { workspaceId: collector.workspaceId, profileId: collector.profileId, externalId, ...update });
    }

    const stats = await ctx.db.query("profileStats").withIndex("by_profileId", (q) => q.eq("profileId", collector.profileId)).unique();
    const leadingModel = await ctx.db
      .query("modelTotals")
      .withIndex("by_profileId_and_totalTokens", (q) => q.eq("profileId", collector.profileId))
      .order("desc")
      .first();
    const uniqueNewDays = [...uniqueDays].filter((day) => !existingDays.has(day)).length;
    const eventDays = [...uniqueDays].sort();
    const lastEventAt = acceptedEvents.reduce((max, event) => Math.max(max, event.occurredAt), stats?.lastEventAt ?? 0);
    const firstDay = [stats?.firstDay, eventDays[0]].filter((value): value is string => Boolean(value)).sort()[0];
    const lastDay = [stats?.lastDay, eventDays.at(-1)].filter((value): value is string => Boolean(value)).sort().at(-1);
    const nextStats = {
      totalTokens: (stats?.totalTokens ?? 0) + total.totalTokens,
      totalCostMicros: (stats?.totalCostMicros ?? 0) + total.costMicros,
      inputTokens: (stats?.inputTokens ?? 0) + total.inputTokens,
      outputTokens: (stats?.outputTokens ?? 0) + total.outputTokens,
      cacheReadTokens: (stats?.cacheReadTokens ?? 0) + total.cacheReadTokens,
      reasoningTokens: (stats?.reasoningTokens ?? 0) + total.reasoningTokens,
      sessions: (stats?.sessions ?? 0) + newSessions,
      activeDays: (stats?.activeDays ?? 0) + uniqueNewDays,
      currentStreakDays: stats?.currentStreakDays ?? 0,
      longestStreakDays: stats?.longestStreakDays ?? 0,
      deviceCount: stats?.deviceCount ?? 1,
      topModel: leadingModel?.model ?? stats?.topModel ?? modelRollups.keys().next().value ?? "unknown",
      firstDay,
      lastDay,
      lastEventAt: lastEventAt || undefined,
      updatedAt: args.receivedAt,
    };
    if (stats) await ctx.db.patch(stats._id, nextStats);
    else await ctx.db.insert("profileStats", { workspaceId: collector.workspaceId, profileId: collector.profileId, ...nextStats });

    const profile = await ctx.db.get(collector.profileId);
    if (profile) {
      const periodDeltas = [
        { period: "all" as const, events: acceptedEvents },
        { period: "30d" as const, events: acceptedEvents.filter((event) => event.occurredAt >= args.receivedAt - 30 * DAY_MS) },
        { period: "7d" as const, events: acceptedEvents.filter((event) => event.occurredAt >= args.receivedAt - 7 * DAY_MS) },
      ];
      for (const periodDelta of periodDeltas) {
        const deltaTokens = periodDelta.events.reduce((sum, event) => sum + event.totalTokens, 0);
        const deltaSpend = periodDelta.events.reduce((sum, event) => sum + event.costMicros, 0);
        for (const metric of ["tokens", "spend"] as const) {
          const prior = await ctx.db
            .query("leaderboardEntries")
            .withIndex("by_profileId_and_period_and_metric", (q) =>
              q.eq("profileId", collector.profileId).eq("period", periodDelta.period).eq("metric", metric),
            )
            .unique();
          const delta = metric === "tokens" ? deltaTokens : deltaSpend;
          const update = {
            handle: profile.handle,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
            verification: profile.verification,
            score: periodDelta.period === "all"
              ? (metric === "tokens" ? nextStats.totalTokens : nextStats.totalCostMicros)
              : (prior?.score ?? 0) + delta,
            totalTokens: nextStats.totalTokens,
            totalCostMicros: nextStats.totalCostMicros,
            updatedAt: args.receivedAt,
          };
          if (prior) await ctx.db.patch(prior._id, update);
          else await ctx.db.insert("leaderboardEntries", {
            workspaceId: collector.workspaceId,
            profileId: collector.profileId,
            period: periodDelta.period,
            metric,
            ...update,
          });
        }
      }
    }

    const network = await ctx.db.query("networkStats").withIndex("by_key", (q) => q.eq("key", "global")).unique();
    const onlineAgents = await ctx.db
      .query("agentLiveStats")
      .withIndex("by_profileId_and_updatedAt", (q) => q.eq("profileId", collector.profileId).gte("updatedAt", args.receivedAt - 45_000))
      .take(100);
    const networkUpdate = {
      totalTokens: (network?.totalTokens ?? 0) + total.totalTokens,
      totalCostMicros: (network?.totalCostMicros ?? 0) + total.costMicros,
      totalSessions: (network?.totalSessions ?? 0) + newSessions,
      profiles: network?.profiles ?? 1,
      activeAgents: onlineAgents.length,
      eventsToday: (network?.eventsToday ?? 0) + acceptedEvents.length,
      updatedAt: args.receivedAt,
    };
    if (network) await ctx.db.patch(network._id, networkUpdate);
    else await ctx.db.insert("networkStats", { key: "global", ...networkUpdate });

    await ctx.db.patch(collector._id, { lastSeenAt: args.receivedAt });
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
  handler: async (ctx) => {
    const now = Date.now();
    const events = await ctx.db
      .query("telemetryEvents")
      .withIndex("by_receivedAt", (q) => q.lt("receivedAt", now - 30 * DAY_MS))
      .take(250);
    const receipts = await ctx.db
      .query("ingestReceipts")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", now - 90 * DAY_MS))
      .take(250);
    for (const event of events) await ctx.db.delete(event._id);
    for (const receipt of receipts) await ctx.db.delete(receipt._id);
    return { events: events.length, receipts: receipts.length };
  },
});
