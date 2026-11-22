import { v } from "convex/values";

export const gatewayFinding = v.object({
  key: v.string(),
  rule: v.union(v.literal("provider_errors"), v.literal("slow_provider"), v.literal("billing_pending")),
  provider: v.string(),
  samples: v.number(),
  observed: v.number(),
});

export const gatewayAlert = v.object({
  ...gatewayFinding.fields,
  openedAt: v.number(),
  updatedAt: v.number(),
  resolvedAt: v.optional(v.number()),
});

export const gatewayAlertHistory = v.object({
  evaluatedAt: v.union(v.null(), v.number()),
  truncated: v.boolean(),
  items: v.array(gatewayAlert),
});
