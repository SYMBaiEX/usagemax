import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  workspaces: defineTable({
    slug: v.string(),
    name: v.string(),
    plan: v.union(v.literal("free"), v.literal("pro"), v.literal("team"), v.literal("enterprise")),
    isPublic: v.boolean(),
    retentionDays: v.number(),
    createdAt: v.number(),
  }).index("by_slug", ["slug"]),

  profiles: defineTable({
    workspaceId: v.id("workspaces"),
    handle: v.string(),
    displayName: v.string(),
    bio: v.string(),
    avatarUrl: v.optional(v.string()),
    isPublic: v.boolean(),
    isVerified: v.boolean(),
    verification: v.union(v.literal("imported"), v.literal("collector"), v.literal("verified")),
    sourceUrl: v.optional(v.string()),
    importedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_handle", ["handle"])
    .index("by_workspaceId", ["workspaceId"]),

  collectors: defineTable({
    workspaceId: v.id("workspaces"),
    profileId: v.id("profiles"),
    name: v.string(),
    keyHash: v.string(),
    keyPrefix: v.string(),
    scopes: v.array(v.string()),
    createdAt: v.number(),
    lastSeenAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_keyHash", ["keyHash"])
    .index("by_workspaceId", ["workspaceId"]),

  profileStats: defineTable({
    workspaceId: v.id("workspaces"),
    profileId: v.id("profiles"),
    totalTokens: v.number(),
    totalCostMicros: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    cacheReadTokens: v.number(),
    reasoningTokens: v.number(),
    sessions: v.number(),
    activeDays: v.number(),
    currentStreakDays: v.number(),
    longestStreakDays: v.number(),
    deviceCount: v.number(),
    topModel: v.string(),
    firstDay: v.optional(v.string()),
    lastDay: v.optional(v.string()),
    lastEventAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_profileId", ["profileId"])
    .index("by_workspaceId", ["workspaceId"]),

  dailyUsage: defineTable({
    workspaceId: v.id("workspaces"),
    profileId: v.id("profiles"),
    day: v.string(),
    source: v.string(),
    provider: v.string(),
    model: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    cacheReadTokens: v.number(),
    reasoningTokens: v.number(),
    totalTokens: v.number(),
    costMicros: v.number(),
    sessions: v.number(),
    requests: v.number(),
    errors: v.number(),
    updatedAt: v.number(),
  })
    .index("by_profileId_and_day", ["profileId", "day"])
    .index("by_profileId_and_day_and_source_and_model", ["profileId", "day", "source", "model"]),

  modelTotals: defineTable({
    workspaceId: v.id("workspaces"),
    profileId: v.id("profiles"),
    provider: v.string(),
    model: v.string(),
    totalTokens: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    costMicros: v.number(),
    requests: v.number(),
    errors: v.number(),
    lastUsedAt: v.number(),
  })
    .index("by_profileId_and_model", ["profileId", "model"])
    .index("by_profileId_and_totalTokens", ["profileId", "totalTokens"]),

  telemetryEvents: defineTable({
    workspaceId: v.id("workspaces"),
    profileId: v.id("profiles"),
    eventKey: v.string(),
    eventHash: v.string(),
    logicalRequestId: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    agentExternalId: v.optional(v.string()),
    parentAgentExternalId: v.optional(v.string()),
    agentName: v.optional(v.string()),
    eventType: v.union(
      v.literal("model_request"),
      v.literal("tool_call"),
      v.literal("agent_state"),
      v.literal("outcome"),
    ),
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
    receivedAt: v.number(),
    schemaVersion: v.number(),
    completeness: v.union(v.literal("reported"), v.literal("estimated"), v.literal("unknown")),
  })
    .index("by_workspaceId_and_eventKey", ["workspaceId", "eventKey"])
    .index("by_profileId_and_occurredAt", ["profileId", "occurredAt"])
    .index("by_receivedAt", ["receivedAt"]),

  ingestReceipts: defineTable({
    workspaceId: v.id("workspaces"),
    collectorId: v.id("collectors"),
    batchId: v.string(),
    payloadHash: v.string(),
    accepted: v.number(),
    duplicates: v.number(),
    createdAt: v.number(),
  })
    .index("by_workspaceId_and_batchId", ["workspaceId", "batchId"])
    .index("by_createdAt", ["createdAt"]),

  ingestRateBuckets: defineTable({
    collectorId: v.id("collectors"),
    bucketStart: v.number(),
    requests: v.number(),
    events: v.number(),
  }).index("by_collectorId_and_bucketStart", ["collectorId", "bucketStart"]),

  sessionReceipts: defineTable({
    workspaceId: v.id("workspaces"),
    profileId: v.id("profiles"),
    sessionId: v.string(),
    firstSeenAt: v.number(),
  }).index("by_workspaceId_and_sessionId", ["workspaceId", "sessionId"]),

  agentLiveStats: defineTable({
    workspaceId: v.id("workspaces"),
    profileId: v.id("profiles"),
    externalId: v.string(),
    parentExternalId: v.optional(v.string()),
    name: v.string(),
    model: v.string(),
    state: v.string(),
    task: v.optional(v.string()),
    tokensPerSecond: v.number(),
    totalTokens: v.number(),
    toolCalls: v.number(),
    errorCount: v.number(),
    sessionStartedAt: v.number(),
    updatedAt: v.number(),
    expiresAt: v.number(),
    traceId: v.optional(v.string()),
  })
    .index("by_workspaceId_and_externalId", ["workspaceId", "externalId"])
    .index("by_profileId_and_updatedAt", ["profileId", "updatedAt"]),

  leaderboardEntries: defineTable({
    workspaceId: v.id("workspaces"),
    profileId: v.id("profiles"),
    handle: v.string(),
    displayName: v.string(),
    avatarUrl: v.optional(v.string()),
    verification: v.string(),
    period: v.union(v.literal("7d"), v.literal("30d"), v.literal("all")),
    metric: v.union(v.literal("tokens"), v.literal("spend")),
    score: v.number(),
    totalTokens: v.number(),
    totalCostMicros: v.number(),
    updatedAt: v.number(),
  })
    .index("by_profileId_and_period_and_metric", ["profileId", "period", "metric"])
    .index("by_period_and_metric_and_score", ["period", "metric", "score"]),

  networkStats: defineTable({
    key: v.string(),
    totalTokens: v.number(),
    totalCostMicros: v.number(),
    totalSessions: v.number(),
    profiles: v.number(),
    activeAgents: v.number(),
    eventsToday: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  outcomes: defineTable({
    workspaceId: v.id("workspaces"),
    profileId: v.id("profiles"),
    eventKey: v.string(),
    logicalRequestId: v.string(),
    outcome: v.union(
      v.literal("accepted"),
      v.literal("rejected"),
      v.literal("abandoned"),
      v.literal("retried"),
    ),
    occurredAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_workspaceId_and_eventKey", ["workspaceId", "eventKey"])
    .index("by_profileId_and_occurredAt", ["profileId", "occurredAt"]),

  quarantine: defineTable({
    workspaceId: v.optional(v.id("workspaces")),
    reason: v.string(),
    reference: v.string(),
    receivedAt: v.number(),
  }).index("by_receivedAt", ["receivedAt"]),
});
