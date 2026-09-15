import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { ConvexError, v } from "convex/values";

import { components } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";

const rateLimiter = new RateLimiter(components.rateLimiter, {
  collectorRequests: { kind: "token bucket", rate: 180, period: MINUTE, capacity: 360 },
  collectorItems: { kind: "token bucket", rate: 20_000, period: MINUTE, capacity: 50_000 },
  linkAttemptsGlobal: { kind: "fixed window", rate: 3_000, period: MINUTE, shards: 20 },
  linkAttemptsPerCode: { kind: "token bucket", rate: 3, period: MINUTE, capacity: 10 },
  management: { kind: "token bucket", rate: 10, period: MINUTE, capacity: 20 },
});

export const consumeManagementAttempt = internalMutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("AUTH_REQUIRED");
    await rateLimiter.limit(ctx, "management", { key: identity.tokenIdentifier, throws: true });
  },
});

export async function enforceCollectorRateLimit(ctx: MutationCtx, collectorId: string, items = 1) {
  try {
    await rateLimiter.limit(ctx, "collectorRequests", { key: collectorId, throws: true });
    await rateLimiter.limit(ctx, "collectorItems", {
      key: collectorId,
      count: Math.max(1, Math.round(items)),
      throws: true,
    });
  } catch {
    throw new ConvexError("RATE_LIMITED");
  }
}

export const consumeDeviceLinkAttempt = internalMutation({
  args: { codeHash: v.string() },
  handler: async (ctx, args) => {
    try {
      await rateLimiter.limit(ctx, "linkAttemptsGlobal", { throws: true });
      await rateLimiter.limit(ctx, "linkAttemptsPerCode", { key: args.codeHash, throws: true });
    } catch {
      throw new ConvexError("RATE_LIMITED");
    }
    return { ok: true };
  },
});
