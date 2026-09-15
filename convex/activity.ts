import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query } from "./_generated/server";
import { requireWorkspaceAccess } from "./account";

export const agents = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const { profile } = await requireWorkspaceAccess(ctx, "finance:read");
    return await ctx.db
      .query("agentLiveStats")
      .withIndex("by_profileId_and_updatedAt", (q) =>
        q.eq("profileId", profile._id),
      )
      .order("desc")
      .paginate(args.paginationOpts);
  },
});
export const outcomes = query({
  args: { paginationOpts: paginationOptsValidator, startAt: v.number() },
  handler: async (ctx, args) => {
    const { profile } = await requireWorkspaceAccess(ctx, "finance:read");
    return await ctx.db
      .query("outcomes")
      .withIndex("by_profileId_and_occurredAt", (q) =>
        q.eq("profileId", profile._id).gte("occurredAt", args.startAt),
      )
      .order("desc")
      .paginate(args.paginationOpts);
  },
});
