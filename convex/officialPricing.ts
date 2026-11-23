import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { DAY_MS, dayFromTimestamp } from "./lib";
import { observedModelRate, pricingFailure, pricingProvider } from "./officialPricingSchema";

async function currentHealth(ctx: MutationCtx, provider: typeof pricingProvider.type) {
  return ctx.db.query("officialPricingHealth").withIndex("by_provider", (q) => q.eq("provider", provider)).unique();
}

export const recordObservation = internalMutation({
  args: {
    provider: pricingProvider, observedAt: v.number(),
    revision: v.string(), models: v.array(observedModelRate),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    if (!/^[a-f0-9]{64}$/.test(args.revision) || args.models.length < 1 || args.models.length > 200)
      throw new ConvexError("INVALID_PRICING_OBSERVATION");
    const { provider, observedAt, revision, models } = args;
    const health = await currentHealth(ctx, provider);
    if (health && health.lastCheckAt >= observedAt) return false;
    const latest = await ctx.db.query("officialPricingCatalogs")
      .withIndex("by_provider_and_effectiveDay", (q) => q.eq("provider", provider))
      .order("desc").first();
    const effectiveDay = dayFromTimestamp(observedAt + DAY_MS);
    const changed = latest?.revision !== revision;
    if (changed) {
      const record = { provider, observedAt, effectiveDay, revision, models };
      if (latest?.effectiveDay === effectiveDay) {
        await ctx.db.replace(latest._id, record);
      } else {
        await ctx.db.insert("officialPricingCatalogs", record);
      }
    }
    const state = { provider, lastCheckAt: observedAt, lastSuccessAt: observedAt, modelCount: models.length };
    if (health) await ctx.db.replace(health._id, state);
    else await ctx.db.insert("officialPricingHealth", state);
    return changed;
  },
});

export const recordFailure = internalMutation({
  args: { provider: pricingProvider, observedAt: v.number(), reason: pricingFailure },
  returns: v.null(),
  handler: async (ctx, { provider, observedAt, reason }) => {
    const health = await currentHealth(ctx, provider);
    if (health && health.lastCheckAt >= observedAt) return null;
    if (health) await ctx.db.patch(health._id, { lastCheckAt: observedAt, lastError: reason });
    else await ctx.db.insert("officialPricingHealth", { provider, lastCheckAt: observedAt, lastError: reason });
    return null;
  },
});

export const status = internalQuery({
  args: {},
  returns: v.array(v.object({
    provider: pricingProvider,
    lastCheckAt: v.number(),
    lastSuccessAt: v.optional(v.number()),
    lastError: v.optional(pricingFailure),
    modelCount: v.optional(v.number()),
    effectiveDay: v.optional(v.string()),
  })),
  handler: async (ctx) => {
    const providers = ["openai", "anthropic"] as const;
    const results = await Promise.all(providers.map(async (provider) => {
      const health = await ctx.db.query("officialPricingHealth")
        .withIndex("by_provider", (q) => q.eq("provider", provider)).unique();
      if (!health) return null;
      const latest = await ctx.db.query("officialPricingCatalogs")
        .withIndex("by_provider_and_effectiveDay", (q) => q.eq("provider", provider))
        .order("desc").first();
      return {
        provider, lastCheckAt: health.lastCheckAt,
        lastSuccessAt: health.lastSuccessAt,
        lastError: health.lastError, modelCount: health.modelCount,
        effectiveDay: latest?.effectiveDay,
      };
    }));
    return results.filter((result) => result !== null);
  },
});
