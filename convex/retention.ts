import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

export const sweep = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("workspaces")
      .paginate({ numItems: 20, cursor: args.cursor ?? null });
    for (const workspace of page.page)
      await ctx.scheduler.runAfter(0, internal.retention.trim, {
        workspaceId: workspace._id,
      });
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.retention.sweep, {
        cursor: page.continueCursor,
      });
  },
});
export const trim = internalMutation({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace || workspace.accessDisabledAt) return;
    const retention = Math.max(1, Math.min(365, workspace.retentionDays));
    const cutoff = Date.now() - retention * 86_400_000;
    const events = await ctx.db
      .query("telemetryEvents")
      .withIndex("by_workspaceId_and_receivedAt", (q) =>
        q.eq("workspaceId", workspace._id).lt("receivedAt", cutoff),
      )
      .take(100);
    for (const event of events) await ctx.db.delete(event._id);
    if (events.length === 100)
      await ctx.scheduler.runAfter(1000, internal.retention.trim, args);
    // Daily usage and financial evidence deliberately survive trace expiry.
    return { removed: events.length };
  },
});
