import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { DAY_MS } from "./lib";

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
    // Disabled organizations are still subject to their configured retention
    // period. Disabling access must not silently exempt their data from expiry.
    if (!workspace) return;
    const retention = Math.max(1, Math.min(365, workspace.retentionDays));
    const cutoff = Date.now() - retention * DAY_MS;
    const events = await ctx.db
      .query("telemetryEvents")
      .withIndex("by_workspaceId_and_receivedAt", (q) =>
        q.eq("workspaceId", workspace._id).lt("receivedAt", cutoff),
      )
      .take(100);
    for (const event of events) await ctx.db.delete(event._id);
    const receipts = await ctx.db.query("gatewayReceipts")
      .withIndex("by_workspaceId_and_historyAt", (q) =>
        q.eq("workspaceId", args.workspaceId).lt("historyAt", cutoff))
      .take(100);
    for (const receipt of receipts) await ctx.db.delete("gatewayReceipts", receipt._id);
    const alerts = await ctx.db.query("gatewayAlertEvents")
      .withIndex("by_workspaceId_and_updatedAt", (q) => q.eq("workspaceId", args.workspaceId).lt("updatedAt", cutoff))
      .take(100);
    for (const alert of alerts) await ctx.db.delete("gatewayAlertEvents", alert._id);
    const evals = await ctx.db.query("gatewayEvalRuns")
      .withIndex("by_workspaceId_and_createdAt", (q) => q.eq("workspaceId", workspace._id).lt("createdAt", cutoff))
      .take(100);
    for (const run of evals) await ctx.db.delete("gatewayEvalRuns", run._id);
    if (events.length === 100 || receipts.length === 100 || alerts.length === 100 || evals.length === 100)
      await ctx.scheduler.runAfter(1000, internal.retention.trim, args);
    // Daily usage and financial evidence deliberately survive trace expiry.
    return { removed: events.length, gatewayReceiptsRemoved: receipts.length };
  },
});
