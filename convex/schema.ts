import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { productTables } from "./productSchema";

export default defineSchema({
  ...productTables,
  users: defineTable({
    workosUserId: v.string(),
    authIdentityKey: v.optional(v.string()),
    preferPersonalWorkspace: v.optional(v.boolean()),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index("by_workosUserId", ["workosUserId"])
    .index("by_authIdentityKey", ["authIdentityKey"])
    .index("by_email", ["email"]),

  workspaces: defineTable({
    ownerId: v.optional(v.id("users")),
    workosOrganizationId: v.optional(v.string()),
    workosUpdatedAt: v.optional(v.number()),
    accessDisabledAt: v.optional(v.number()),
    contractReference: v.optional(v.string()),
    enterpriseActivatedAt: v.optional(v.number()),
    companyDataPrivate: v.optional(v.boolean()),
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
    directoryId: v.optional(v.string()),
    role: v.string(),
    roles: v.optional(v.array(v.string())),
    permissions: v.optional(v.array(v.string())),
    source: v.optional(v.union(v.literal("personal"), v.literal("workos"), v.literal("directory"))),
    status: v.union(v.literal("active"), v.literal("invited"), v.literal("deactivated")),
    lastSyncedAt: v.optional(v.number()),
    authorizationChangedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspaceId_and_userId", ["workspaceId", "userId"])
    .index("by_workspaceId_and_status", ["workspaceId", "status"])
    .index("by_workspaceId_and_directoryId", ["workspaceId", "directoryId"])
    .index("by_userId_and_workspaceId", ["userId", "workspaceId"])
    .index("by_workosOrganizationId", ["workosOrganizationId"]),

  directoryUsers: defineTable({
    workspaceId: v.id("workspaces"),
    directoryId: v.string(),
    directoryUserId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    state: v.union(v.literal("active"), v.literal("inactive"), v.literal("deleted")),
    roles: v.array(v.string()),
    lastSyncedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspaceId_and_directoryUserId", ["workspaceId", "directoryUserId"])
    .index("by_workspaceId_and_email", ["workspaceId", "email"])
    .index("by_directoryId", ["directoryId"]),

  directories: defineTable({
    workspaceId: v.id("workspaces"),
    organizationId: v.string(),
    directoryId: v.string(),
    name: v.optional(v.string()),
    type: v.optional(v.string()),
    state: v.union(v.literal("active"), v.literal("deleted")),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_workspaceId_and_directoryId", ["workspaceId", "directoryId"])
    .index("by_directoryId", ["directoryId"]),

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
    updatedAt: v.optional(v.number()),
  })
    .index("by_handle", ["handle"])
    .index("by_workspaceId", ["workspaceId"])
    .index("by_ownerId", ["ownerId"]),

  collectors: defineTable({
    workspaceId: v.id("workspaces"),
    profileId: v.id("profiles"),
    ownerUserId: v.optional(v.id("users")),
    projectId: v.optional(v.id("projects")),
    name: v.string(),
    keyHash: v.string(),
    keyPrefix: v.string(),
    installationIdHash: v.optional(v.string()),
    scopes: v.array(v.string()),
    platform: v.optional(v.string()),
    cliVersion: v.optional(v.string()),
    createdAt: v.number(),
    lastSeenAt: v.optional(v.number()),
    lastSuccessAt: v.optional(v.number()),
    lastFailureAt: v.optional(v.number()),
    lastFailureCode: v.optional(v.string()),
    lastSyncRunId: v.optional(v.string()),
    lastSyncPhase: v.optional(v.union(
      v.literal("scanning"),
      v.literal("uploading"),
      v.literal("complete"),
      v.literal("failed"),
    )),
    lastFullSyncAt: v.optional(v.number()),
    coverageStatus: v.optional(v.union(
      v.literal("not_assessed"),
      v.literal("complete"),
      v.literal("partial"),
      v.literal("unverified"),
    )),
    parserCoverageCertified: v.optional(v.boolean()),
    coverageStartDay: v.optional(v.string()),
    coverageEndDay: v.optional(v.string()),
    inventoryComplete: v.optional(v.boolean()),
    inventoryErrors: v.optional(v.number()),
    inventoryTruncated: v.optional(v.boolean()),
    sourceCount: v.optional(v.number()),
    unresolvedCorrections: v.optional(v.number()),
    snapshotBaselineEstablishedAt: v.optional(v.number()),
    snapshotBaselineMode: v.optional(v.union(
      v.literal("native"),
      v.literal("legacy_adopted"),
    )),
    rotatedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_workspaceId_and_ownerUserId", ["workspaceId", "ownerUserId"])
    .index("by_workspaceId_and_ownerUserId_and_revokedAt", ["workspaceId", "ownerUserId", "revokedAt"])
    .index("by_keyHash", ["keyHash"])
    .index("by_workspaceId", ["workspaceId"])
    .index("by_workspaceId_and_revokedAt", ["workspaceId", "revokedAt"])
    .index("by_workspaceId_and_installationIdHash", ["workspaceId", "installationIdHash"]),

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
    .index("by_workspaceId_and_userId_and_usedAt_and_expiresAt", ["workspaceId", "userId", "usedAt", "expiresAt"])
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
    topModelProvider: v.optional(v.string()),
    topModelMetric: v.optional(v.union(v.literal("tokens"), v.literal("spend"))),
    sessionCoverage: v.optional(v.union(v.literal("unknown"), v.literal("partial"), v.literal("complete"))),
    summaryScheduledAt: v.optional(v.number()),
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
    .index("by_profileId_and_model_and_day", ["profileId", "model", "day"])
    .index("by_profileId_and_source_and_day", ["profileId", "source", "day"])
    .index("by_profileId_and_source_and_model_and_day", ["profileId", "source", "model", "day"])
    .index("by_profileId_and_day_and_source_and_model", ["profileId", "day", "source", "model"])
    .index("by_profileId_and_day_and_source_and_provider_and_model", ["profileId", "day", "source", "provider", "model"])
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
    collectorId: v.optional(v.id("collectors")),
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
    .index("by_profileId_and_provider_and_model", ["profileId", "provider", "model"])
    .index("by_profileId_and_totalTokens", ["profileId", "totalTokens"])
    .index("by_profileId_and_costMicros", ["profileId", "costMicros"]),

  telemetryEvents: defineTable({
    workspaceId: v.id("workspaces"),
    profileId: v.id("profiles"),
    collectorId: v.optional(v.id("collectors")),
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
    bucketVersion: v.optional(v.number()),
    completeness: v.union(v.literal("reported"), v.literal("estimated"), v.literal("unknown")),
  })
    .index("by_workspaceId_and_eventKey", ["workspaceId", "eventKey"])
    .index("by_collectorId_and_eventKey", ["collectorId", "eventKey"])
    .index("by_profileId_and_occurredAt", ["profileId", "occurredAt"])
    .index("by_workspaceId_and_receivedAt", ["workspaceId", "receivedAt"])
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
    .index("by_collectorId_and_batchId", ["collectorId", "batchId"])
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
    collectorId: v.optional(v.id("collectors")),
    source: v.optional(v.string()),
    sessionId: v.string(),
    firstSeenAt: v.number(),
  })
    .index("by_workspaceId_and_sessionId", ["workspaceId", "sessionId"])
    .index("by_collectorId_and_source_and_sessionId", ["collectorId", "source", "sessionId"]),

  agentLiveStats: defineTable({
    workspaceId: v.id("workspaces"),
    profileId: v.id("profiles"),
    collectorId: v.optional(v.id("collectors")),
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
    .index("by_collectorId_and_externalId", ["collectorId", "externalId"])
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
    .index("by_period_and_metric_and_isPublic_and_verification_and_score", ["period", "metric", "isPublic", "verification", "score"])
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
    collectorId: v.optional(v.id("collectors")),
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
    .index("by_collectorId_and_eventKey", ["collectorId", "eventKey"])
    .index("by_profileId_and_occurredAt", ["profileId", "occurredAt"]),

  collectorUsageSnapshots: defineTable({
    workspaceId: v.id("workspaces"),
    profileId: v.id("profiles"),
    collectorId: v.id("collectors"),
    source: v.string(),
    day: v.string(),
    provider: v.string(),
    model: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    cacheReadTokens: v.number(),
    cacheWriteTokens: v.number(),
    reasoningTokens: v.number(),
    unclassifiedTokens: v.number(),
    totalTokens: v.number(),
    costMicros: v.number(),
    requests: v.number(),
    errors: v.number(),
    costBasis: v.union(v.literal("reported"), v.literal("estimated"), v.literal("api-equivalent"), v.literal("unknown")),
    pricingVersion: v.optional(v.string()),
    contentHash: v.string(),
    revision: v.number(),
    seenRunId: v.optional(v.string()),
    lastUsedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_collectorId_and_source_and_day", ["collectorId", "source", "day"])
    .index("by_collectorId_and_source_and_day_and_provider_and_model", ["collectorId", "source", "day", "provider", "model"])
    .index("by_profileId_and_day", ["profileId", "day"]),

  snapshotRuns: defineTable({
    workspaceId: v.id("workspaces"),
    profileId: v.id("profiles"),
    collectorId: v.id("collectors"),
    runId: v.string(),
    mode: v.union(v.literal("incremental"), v.literal("full"), v.literal("archives")),
    baselineMode: v.optional(v.union(v.literal("apply"), v.literal("adopt-current"))),
    status: v.union(v.literal("scanning"), v.literal("uploading"), v.literal("complete"), v.literal("failed")),
    sourceCount: v.number(),
    partitionCount: v.number(),
    acceptedPartitions: v.number(),
    pendingCleanups: v.optional(v.number()),
    changedRows: v.number(),
    correctionRows: v.number(),
    inventoryComplete: v.boolean(),
    inventoryErrors: v.number(),
    inventoryTruncated: v.boolean(),
    parserCoverageCertified: v.optional(v.boolean()),
    coverageStartDay: v.optional(v.string()),
    coverageEndDay: v.optional(v.string()),
    failureCode: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_collectorId_and_runId", ["collectorId", "runId"])
    .index("by_collectorId_and_updatedAt", ["collectorId", "updatedAt"])
    .index("by_status_and_updatedAt", ["status", "updatedAt"]),

  snapshotChunkGroups: defineTable({
    collectorId: v.id("collectors"),
    runId: v.string(),
    source: v.string(),
    day: v.string(),
    revision: v.number(),
    chunkCount: v.number(),
    nextChunk: v.number(),
    complete: v.boolean(),
    pricingVersion: v.optional(v.string()),
    done: v.boolean(),
    updatedAt: v.number(),
  }).index("by_collectorId_and_runId_and_source_and_day", ["collectorId", "runId", "source", "day"])
    .index("by_updatedAt", ["updatedAt"]),

  snapshotPartitionHeads: defineTable({
    collectorId: v.id("collectors"), source: v.string(), day: v.string(), runId: v.string(), revision: v.number(),
  }).index("by_collectorId_and_source_and_day", ["collectorId", "source", "day"]),

  snapshotReceipts: defineTable({
    collectorId: v.id("collectors"),
    partitionId: v.string(),
    payloadHash: v.string(),
    revision: v.number(),
    changedRows: v.number(),
    correctionRows: v.number(),
    createdAt: v.number(),
  })
    .index("by_collectorId_and_partitionId", ["collectorId", "partitionId"])
    .index("by_createdAt", ["createdAt"]),

  collectorSessions: defineTable({
    workspaceId: v.id("workspaces"),
    profileId: v.id("profiles"),
    collectorId: v.id("collectors"),
    source: v.string(),
    sessionKey: v.string(),
    firstActivityAt: v.optional(v.number()),
    lastActivityAt: v.optional(v.number()),
    discoveredAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_collectorId_and_source_and_sessionKey", ["collectorId", "source", "sessionKey"])
    .index("by_profileId_and_lastActivityAt", ["profileId", "lastActivityAt"]),

  auditEvents: defineTable({
    workspaceId: v.id("workspaces"),
    actorUserId: v.optional(v.id("users")),
    action: v.string(),
    targetType: v.string(),
    targetId: v.optional(v.string()),
    summary: v.string(),
    createdAt: v.number(),
  })
    .index("by_workspaceId_and_createdAt", ["workspaceId", "createdAt"])
    .index("by_createdAt", ["createdAt"]),

  workosEventReceipts: defineTable({
    eventId: v.string(),
    eventName: v.string(),
    outcome: v.string(),
    createdAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_createdAt", ["createdAt"]),

  accountDeletionRequests: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    profileId: v.optional(v.id("profiles")),
    requestedAt: v.number(),
    scheduledFor: v.number(),
    stage: v.optional(v.string()),
    processedRows: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index("by_userId_and_requestedAt", ["userId", "requestedAt"])
    .index("by_scheduledFor", ["scheduledFor"]),

  quarantine: defineTable({
    workspaceId: v.optional(v.id("workspaces")),
    reason: v.string(),
    reference: v.string(),
    receivedAt: v.number(),
  }).index("by_receivedAt", ["receivedAt"]),
});
