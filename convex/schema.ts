import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    workosUserId: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index("by_workosUserId", ["workosUserId"])
    .index("by_email", ["email"]),

  workspaces: defineTable({
    ownerId: v.optional(v.id("users")),
    workosOrganizationId: v.optional(v.string()),
    slug: v.string(),
    name: v.string(),
    plan: v.union(v.literal("free"), v.literal("pro"), v.literal("team"), v.literal("enterprise")),
    isPublic: v.boolean(),
    retentionDays: v.number(),
    createdAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_ownerId", ["ownerId"])
    .index("by_workosOrganizationId", ["workosOrganizationId"]),

  workspaceMemberships: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    workosOrganizationId: v.optional(v.string()),
    role: v.string(),
    status: v.union(v.literal("active"), v.literal("invited"), v.literal("deactivated")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspaceId_and_userId", ["workspaceId", "userId"])
    .index("by_userId_and_workspaceId", ["userId", "workspaceId"])
    .index("by_workosOrganizationId", ["workosOrganizationId"]),

  profiles: defineTable({
    ownerId: v.optional(v.id("users")),
    workspaceId: v.id("workspaces"),
    handle: v.string(),
    displayName: v.string(),
    bio: v.string(),
    avatarUrl: v.optional(v.string()),
    isPublic: v.boolean(),
    isVerified: v.boolean(),
    verification: v.union(v.literal("account"), v.literal("imported"), v.literal("collector"), v.literal("verified")),
    sourceUrl: v.optional(v.string()),
    importedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_handle", ["handle"])
    .index("by_workspaceId", ["workspaceId"])
    .index("by_ownerId", ["ownerId"]),

  collectors: defineTable({
    workspaceId: v.id("workspaces"),
    profileId: v.id("profiles"),
    name: v.string(),
    keyHash: v.string(),
    keyPrefix: v.string(),
    scopes: v.array(v.string()),
    platform: v.optional(v.string()),
    cliVersion: v.optional(v.string()),
    createdAt: v.number(),
    lastSeenAt: v.optional(v.number()),
    lastSuccessAt: v.optional(v.number()),
    lastFailureAt: v.optional(v.number()),
    lastFailureCode: v.optional(v.string()),
    rotatedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_keyHash", ["keyHash"])
    .index("by_workspaceId", ["workspaceId"]),

  deviceLinkCodes: defineTable({
    workspaceId: v.id("workspaces"),
    profileId: v.id("profiles"),
    userId: v.id("users"),
    codeHash: v.string(),
    codePrefix: v.string(),
    deviceName: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    collectorId: v.optional(v.id("collectors")),
  })
    .index("by_codeHash", ["codeHash"])
    .index("by_workspaceId", ["workspaceId"])
    .index("by_expiresAt", ["expiresAt"]),

  profileStats: defineTable({
    workspaceId: v.id("workspaces"),
    profileId: v.id("profiles"),
    totalTokens: v.number(),
    totalCostMicros: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    cacheReadTokens: v.number(),
    cacheWriteTokens: v.optional(v.number()),
    reasoningTokens: v.number(),
    unclassifiedTokens: v.optional(v.number()),
    costBasis: v.optional(v.union(v.literal("reported"), v.literal("estimated"), v.literal("api-equivalent"), v.literal("mixed"), v.literal("unknown"))),
    costSource: v.optional(v.string()),
    sources: v.optional(v.array(v.string())),
    sessions: v.number(),
    activeDays: v.number(),
    currentStreakDays: v.number(),
    longestStreakDays: v.number(),
    deviceCount: v.number(),
    topModel: v.string(),
    firstDay: v.optional(v.string()),
    lastDay: v.optional(v.string()),
    lastEventAt: v.optional(v.number()),
    leaderboardRank: v.optional(v.number()),
    peakDay: v.optional(v.string()),
    peakDayCostMicros: v.optional(v.number()),
    avgCostPerActiveDayMicros: v.optional(v.number()),
    lastSyncAt: v.optional(v.number()),
    syncStatus: v.optional(v.union(v.literal("healthy"), v.literal("degraded"), v.literal("stale"))),
    syncErrorCode: v.optional(v.string()),
    pricingVersion: v.optional(v.string()),
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
    cacheWriteTokens: v.optional(v.number()),
    reasoningTokens: v.number(),
    unclassifiedTokens: v.optional(v.number()),
    totalTokens: v.number(),
    costMicros: v.number(),
    costBasis: v.optional(v.union(v.literal("reported"), v.literal("estimated"), v.literal("api-equivalent"), v.literal("mixed"), v.literal("unknown"))),
    sessions: v.number(),
    requests: v.number(),
    errors: v.number(),
    updatedAt: v.number(),
  })
    .index("by_profileId_and_day", ["profileId", "day"])
    .index("by_profileId_and_day_and_source_and_model", ["profileId", "day", "source", "model"])
    .index("by_profileId_and_source_and_updatedAt", ["profileId", "source", "updatedAt"]),

  profileDailyTotals: defineTable({
    workspaceId: v.id("workspaces"),
    profileId: v.id("profiles"),
    day: v.string(),
    totalTokens: v.number(),
    outputTokens: v.number(),
    unclassifiedTokens: v.optional(v.number()),
    costMicros: v.number(),
    costBasis: v.optional(v.union(v.literal("reported"), v.literal("estimated"), v.literal("api-equivalent"), v.literal("mixed"), v.literal("unknown"))),
    sessions: v.number(),
    requests: v.number(),
    errors: v.number(),
    updatedAt: v.number(),
  })
    .index("by_profileId_and_day", ["profileId", "day"])
    .index("by_profileId_and_updatedAt", ["profileId", "updatedAt"]),

  dailyDimensions: defineTable({
    workspaceId: v.id("workspaces"),
    profileId: v.id("profiles"),
    day: v.string(),
    dimension: v.union(v.literal("source"), v.literal("device")),
    key: v.string(),
    keyHash: v.optional(v.string()),
    origin: v.string(),
    outputTokens: v.number(),
    unclassifiedTokens: v.number(),
    totalTokens: v.number(),
    costMicros: v.number(),
    costBasis: v.union(v.literal("reported"), v.literal("estimated"), v.literal("api-equivalent"), v.literal("mixed"), v.literal("unknown")),
    sessions: v.number(),
    updatedAt: v.number(),
  })
    .index("by_profileId_and_dimension_and_day", ["profileId", "dimension", "day"])
    .index("by_profileId_and_dimension_and_day_and_key", ["profileId", "dimension", "day", "key"])
    .index("by_profileId_and_origin_and_updatedAt", ["profileId", "origin", "updatedAt"]),

  profileDevices: defineTable({
    workspaceId: v.id("workspaces"),
    profileId: v.id("profiles"),
    deviceHash: v.string(),
    publicLabel: v.string(),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index("by_profileId_and_deviceHash", ["profileId", "deviceHash"])
    .index("by_profileId", ["profileId"]),

  modelTotals: defineTable({
    workspaceId: v.id("workspaces"),
    profileId: v.id("profiles"),
    provider: v.string(),
    model: v.string(),
    totalTokens: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    cacheReadTokens: v.optional(v.number()),
    cacheWriteTokens: v.optional(v.number()),
    reasoningTokens: v.optional(v.number()),
    unclassifiedTokens: v.optional(v.number()),
    costMicros: v.number(),
    costBasis: v.optional(v.union(v.literal("reported"), v.literal("estimated"), v.literal("api-equivalent"), v.literal("mixed"), v.literal("unknown"))),
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
    cacheWriteTokens: v.optional(v.number()),
    reasoningTokens: v.number(),
    totalTokens: v.number(),
    costMicros: v.number(),
    costBasis: v.optional(v.union(v.literal("reported"), v.literal("estimated"), v.literal("unknown"))),
    pricingSource: v.optional(v.string()),
    pricingVersion: v.optional(v.string()),
    serviceTier: v.optional(v.string()),
    region: v.optional(v.string()),
    currency: v.optional(v.string()),
    projectId: v.optional(v.string()),
    costCenter: v.optional(v.string()),
    accountingMode: v.optional(v.union(v.literal("usage"), v.literal("observability"))),
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
  })
    .index("by_collectorId_and_bucketStart", ["collectorId", "bucketStart"])
    .index("by_bucketStart", ["bucketStart"]),

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
    .index("by_profileId_and_updatedAt", ["profileId", "updatedAt"])
    .index("by_expiresAt", ["expiresAt"]),

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
    costBasis: v.optional(v.union(v.literal("reported"), v.literal("estimated"), v.literal("api-equivalent"), v.literal("mixed"), v.literal("unknown"))),
    sessions: v.optional(v.number()),
    activeDays: v.optional(v.number()),
    lastEventAt: v.optional(v.number()),
    isPublic: v.optional(v.boolean()),
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

  networkCounterShards: defineTable({
    shard: v.number(),
    totalTokens: v.number(),
    totalCostMicros: v.number(),
    totalSessions: v.number(),
    profiles: v.number(),
    eventsDay: v.string(),
    eventsToday: v.number(),
    updatedAt: v.number(),
  }).index("by_shard", ["shard"]),

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
