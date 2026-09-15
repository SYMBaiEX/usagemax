import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

export const check = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("collectors")
      .paginate({ numItems: 100, cursor: args.cursor ?? null });
    const now = Date.now();
    for (const collector of page.page) {
      if (
        collector.revokedAt ||
        !collector.lastSuccessAt ||
        now - collector.lastSuccessAt < 48 * 3_600_000
      )
        continue;
      const workspace = await ctx.db.get(collector.workspaceId);
      const userId = collector.ownerUserId ?? workspace?.ownerId;
      if (!workspace || workspace.accessDisabledAt || !userId) continue;
      const member = await ctx.db
        .query("workspaceMemberships")
        .withIndex("by_userId_and_workspaceId", (q) =>
          q.eq("userId", userId).eq("workspaceId", workspace._id),
        )
        .unique();
      if (member?.status !== "active") continue;
      const preferences = await ctx.db
        .query("preferences")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique();
      if (preferences?.notificationCoverage === false) continue;
      // Once per unchanged successful sync, not an endless daily warning.
      const dedupeKey = `coverage:${collector._id}:${collector.lastSuccessAt}`;
      if (
        await ctx.db
          .query("notifications")
          .withIndex("by_workspaceId_and_dedupeKey", (q) =>
            q.eq("workspaceId", workspace._id).eq("dedupeKey", dedupeKey),
          )
          .unique()
      )
        continue;
      await ctx.db.insert("notifications", {
        workspaceId: workspace._id,
        userId,
        dedupeKey,
        kind: "coverage",
        title: `${collector.name} has not synced recently`,
        detail:
          "No successful upload in at least 48 hours. This can simply mean the computer is offline or unused; it is not proof of missing usage. Run UsageMax there when you want a refresh.",
        createdAt: now,
      });
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(1000, internal.coverageAlerts.check, {
        cursor: page.continueCursor,
      });
  },
});
