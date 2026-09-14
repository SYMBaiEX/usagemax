import { v } from "convex/values";

import { internalMutation } from "./_generated/server";

export const backfillProfileDailyTotals = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    numItems: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("dailyUsage").paginate({
      cursor: args.cursor,
      numItems: Math.min(250, Math.max(1, Math.round(args.numItems ?? 100))),
    });
    const groups = new Map<string, { profileId: (typeof page.page)[number]["profileId"]; day: string }>();
    for (const row of page.page) {
      groups.set(`${row.profileId}\u0000${row.day}`, { profileId: row.profileId, day: row.day });
    }

    for (const { profileId, day } of groups.values()) {
      const rows = await ctx.db
        .query("dailyUsage")
        .withIndex("by_profileId_and_day", (q) => q.eq("profileId", profileId).eq("day", day))
        .collect();
      if (rows.length === 0) continue;
      const existing = await ctx.db
        .query("profileDailyTotals")
        .withIndex("by_profileId_and_day", (q) => q.eq("profileId", profileId).eq("day", day))
        .unique();
      const value = {
        workspaceId: rows[0].workspaceId,
        profileId,
        day,
        totalTokens: rows.reduce((sum, row) => sum + row.totalTokens, 0),
        outputTokens: rows.reduce((sum, row) => sum + row.outputTokens, 0),
        costMicros: rows.reduce((sum, row) => sum + row.costMicros, 0),
        sessions: rows.reduce((sum, row) => sum + row.sessions, 0),
        requests: rows.reduce((sum, row) => sum + row.requests, 0),
        errors: rows.reduce((sum, row) => sum + row.errors, 0),
        updatedAt: Math.max(...rows.map((row) => row.updatedAt)),
      };
      if (existing) await ctx.db.replace(existing._id, value);
      else await ctx.db.insert("profileDailyTotals", value);
    }

    return {
      continueCursor: page.continueCursor,
      isDone: page.isDone,
      rowsScanned: page.page.length,
      totalsUpdated: groups.size,
    };
  },
});
