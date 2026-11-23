import { defineTable } from "convex/server";
import { v } from "convex/values";

export const pricingProvider = v.union(v.literal("openai"), v.literal("anthropic"));
const observedRate = v.object({
  input: v.number(),
  output: v.number(),
  cacheRead: v.union(v.number(), v.null()),
  cacheWrite: v.optional(v.record(v.string(), v.number())),
});
export const observedModelRate = v.object({
  model: v.string(),
  standard: observedRate,
  context: v.optional(v.object({ shortMax: v.number(), long: observedRate })),
  through: v.optional(v.string()),
});
export const pricingFailure = v.union(v.literal("source_unavailable"), v.literal("invalid_source"));

export const officialPricingTables = {
  officialPricingCatalogs: defineTable({
    provider: pricingProvider,
    effectiveDay: v.string(),
    revision: v.string(),
    models: v.array(observedModelRate),
    observedAt: v.number(),
  }).index("by_provider_and_effectiveDay", ["provider", "effectiveDay"]),
  officialPricingHealth: defineTable({
    provider: pricingProvider,
    lastCheckAt: v.number(),
    lastSuccessAt: v.optional(v.number()),
    lastError: v.optional(pricingFailure),
    modelCount: v.optional(v.number()),
  }).index("by_provider", ["provider"]),
};
