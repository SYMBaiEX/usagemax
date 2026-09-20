import { defineTable } from "convex/server";
import { v } from "convex/values";
import { memberRole } from "./productPolicy";

export const productTables = {
  workspaceBilling: defineTable({
    workspaceId: v.id("workspaces"),
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.optional(v.string()),
    stripePriceId: v.optional(v.string()),
    tier: v.union(v.literal("team"), v.literal("enterprise")),
    status: v.union(
      v.literal("inactive"),
      v.literal("trialing"),
      v.literal("active"),
      v.literal("past_due"),
      v.literal("canceled"),
      v.literal("incomplete"),
      v.literal("unpaid"),
      v.literal("paused"),
    ),
    seatQuantity: v.optional(v.number()),
    currentPeriodEnd: v.optional(v.number()),
    cancelAtPeriodEnd: v.optional(v.boolean()),
    lastInvoiceId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspaceId", ["workspaceId"])
    .index("by_stripeCustomerId", ["stripeCustomerId"])
    .index("by_stripeSubscriptionId", ["stripeSubscriptionId"]),
  billingEvents: defineTable({
    eventId: v.string(),
    type: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    createdAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_workspaceId_and_createdAt", ["workspaceId", "createdAt"]),
  teams: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    description: v.string(),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_workspaceId", ["workspaceId"]),
  teamMembers: defineTable({
    workspaceId: v.id("workspaces"),
    teamId: v.id("teams"),
    userId: v.id("users"),
    manager: v.boolean(),
    joinedAt: v.number(),
    leftAt: v.optional(v.number()),
  })
    .index("by_teamId_and_userId_and_leftAt", ["teamId", "userId", "leftAt"])
    .index("by_workspaceId_and_userId_and_leftAt", [
      "workspaceId",
      "userId",
      "leftAt",
    ])
    .index("by_teamId_and_leftAt", ["teamId", "leftAt"]),
  projects: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    key: v.string(),
    costCenter: v.string(),
    teamId: v.optional(v.id("teams")),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_workspaceId_and_key", ["workspaceId", "key"]),
  workspaceInvitations: defineTable({
    workspaceId: v.id("workspaces"),
    externalId: v.string(),
    email: v.string(),
    role: memberRole,
    teamId: v.optional(v.id("teams")),
    state: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("revoked"),
      v.literal("expired"),
    ),
    expiresAt: v.number(),
    invitedBy: v.id("users"),
    onboardingAppliedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_externalId", ["externalId"])
    .index("by_onboarding", [
      "workspaceId",
      "email",
      "onboardingAppliedAt",
      "state",
    ])
    .index("by_workspaceId_and_state_and_email", [
      "workspaceId",
      "state",
      "email",
    ]),
  organizationOperations: defineTable({
    userId: v.id("users"),
    requestId: v.string(),
    name: v.string(),
    state: v.union(
      v.literal("pending"),
      v.literal("complete"),
      v.literal("failed"),
    ),
    externalId: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces")),
    createdAt: v.number(),
  }).index("by_userId_and_requestId", ["userId", "requestId"]),
  preferences: defineTable({
    userId: v.id("users"),
    timezone: v.string(),
    weekStartsOn: v.union(v.literal("monday"), v.literal("sunday")),
    defaultRange: v.union(
      v.literal("7d"),
      v.literal("30d"),
      v.literal("90d"),
      v.literal("all"),
    ),
    notificationBudgets: v.boolean(),
    notificationCoverage: v.boolean(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),
  savedViews: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    name: v.string(),
    startDay: v.string(),
    endDay: v.string(),
    model: v.optional(v.string()),
    source: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_workspaceId_and_userId", ["workspaceId", "userId"]),
  financialEntries: defineTable({
    workspaceId: v.id("workspaces"),
    externalKey: v.string(),
    source: v.union(v.literal("manual"), v.literal("provider")),
    connectionId: v.optional(v.id("providerConnections")),
    provider: v.string(),
    account: v.string(),
    day: v.string(),
    currency: v.string(),
    amountMicros: v.number(),
    kind: v.union(
      v.literal("usage"),
      v.literal("subscription"),
      v.literal("credit"),
      v.literal("adjustment"),
    ),
    basis: v.union(
      v.literal("estimated"),
      v.literal("reported"),
      v.literal("billed"),
    ),
    invoiceId: v.optional(v.string()),
    model: v.optional(v.string()),
    person: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    teamId: v.optional(v.id("teams")),
    note: v.string(),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspaceId_and_externalKey", ["workspaceId", "externalKey"])
    .index("by_workspaceId_and_day", ["workspaceId", "day"])
    .index("by_workspaceId_and_teamId_and_day", [
      "workspaceId",
      "teamId",
      "day",
    ])
    .index("by_connectionId_and_day", ["connectionId", "day"]),
  financialDaily: defineTable({
    workspaceId: v.id("workspaces"),
    day: v.string(),
    currency: v.string(),
    basis: v.union(
      v.literal("estimated"),
      v.literal("reported"),
      v.literal("billed"),
    ),
    amountMicros: v.number(),
    entries: v.number(),
    updatedAt: v.number(),
  }).index("by_workspaceId_and_day_and_currency_and_basis", [
    "workspaceId",
    "day",
    "currency",
    "basis",
  ]),
  financialMonthly: defineTable({
    workspaceId: v.id("workspaces"),
    month: v.string(),
    currency: v.string(),
    basis: v.union(
      v.literal("estimated"),
      v.literal("reported"),
      v.literal("billed"),
    ),
    amountMicros: v.number(),
    entries: v.number(),
    updatedAt: v.number(),
  }).index("by_workspaceId_and_month_and_currency_and_basis", [
    "workspaceId",
    "month",
    "currency",
    "basis",
  ]),
  budgets: defineTable({
    workspaceId: v.id("workspaces"),
    ownerId: v.id("users"),
    name: v.string(),
    currency: v.string(),
    limitMicros: v.number(),
    source: v.union(v.literal("tracked"), v.literal("ledger")),
    basis: v.union(
      v.literal("estimated"),
      v.literal("reported"),
      v.literal("billed"),
    ),
    thresholdPercent: v.number(),
    enabled: v.boolean(),
    lastEvaluatedMonth: v.optional(v.string()),
    lastNotifiedMonth: v.optional(v.string()),
    observedMicros: v.optional(v.number()),
    evaluatedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_workspaceId", ["workspaceId"])
    .index("by_enabled", ["enabled"]),
  notifications: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    dedupeKey: v.string(),
    kind: v.union(
      v.literal("budget"),
      v.literal("coverage"),
      v.literal("system"),
    ),
    title: v.string(),
    detail: v.string(),
    readAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_workspaceId_and_userId_and_createdAt", [
      "workspaceId",
      "userId",
      "createdAt",
    ])
    .index("by_workspaceId_and_dedupeKey", ["workspaceId", "dedupeKey"]),
  savingsActions: defineTable({
    workspaceId: v.id("workspaces"),
    title: v.string(),
    description: v.string(),
    evidence: v.string(),
    currency: v.string(),
    potentialMicros: v.number(),
    observedMicros: v.optional(v.number()),
    baseline: v.optional(v.string()),
    resultEvidence: v.optional(v.string()),
    ownerId: v.id("users"),
    state: v.union(
      v.literal("proposed"),
      v.literal("approved"),
      v.literal("measuring"),
      v.literal("verified"),
      v.literal("dismissed"),
    ),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_workspaceId_and_state", ["workspaceId", "state"]),
  providerConnections: defineTable({
    workspaceId: v.id("workspaces"),
    provider: v.union(
      v.literal("anthropic"),
      v.literal("cursor"),
      v.literal("github"),
    ),
    name: v.string(),
    accountId: v.string(),
    secretCiphertext: v.string(),
    secretIv: v.string(),
    keyVersion: v.string(),
    state: v.union(
      v.literal("connected"),
      v.literal("error"),
      v.literal("paused"),
    ),
    syncDay: v.optional(v.string()),
    syncPage: v.optional(v.number()),
    syncAmountMicros: v.optional(v.number()),
    syncSeen: v.optional(v.number()),
    syncExpected: v.optional(v.number()),
    reportedSeats: v.optional(v.number()),
    lastSuccessAt: v.optional(v.number()),
    lastAttemptAt: v.optional(v.number()),
    nextSyncAt: v.number(),
    syncLeaseUntil: v.optional(v.number()),
    consecutiveFailures: v.optional(v.number()),
    syncLeaseId: v.optional(v.string()),
    lastError: v.optional(v.string()),
    coverageStartDay: v.optional(v.string()),
    coverageEndDay: v.optional(v.string()),
    coverageNote: v.string(),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_workspaceId", ["workspaceId"])
    .index("by_state_and_nextSyncAt", ["state", "nextSyncAt"])
    .index("by_state_and_syncLeaseUntil", ["state", "syncLeaseUntil"]),
  providerDailyUsage: defineTable({
    workspaceId: v.id("workspaces"),
    connectionId: v.id("providerConnections"),
    externalKey: v.string(),
    day: v.string(),
    person: v.optional(v.string()),
    model: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    cacheReadTokens: v.number(),
    requests: v.number(),
    costMicros: v.optional(v.number()),
    currency: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_connectionId_and_externalKey", ["connectionId", "externalKey"])
    .index("by_workspaceId_and_day", ["workspaceId", "day"]),
  providerIdentityMappings: defineTable({
    workspaceId: v.id("workspaces"),
    connectionId: v.id("providerConnections"),
    externalPerson: v.string(),
    userId: v.id("users"),
    effectiveFrom: v.string(),
    effectiveUntil: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_workspaceId", ["workspaceId"])
    .index("by_connectionId_and_externalPerson", [
      "connectionId",
      "externalPerson",
    ]),
};
