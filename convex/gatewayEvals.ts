import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, query, type QueryCtx } from "./_generated/server";
import { requireWorkspaceAccess } from "./account";
import { authenticateGateway, consumeGatewayQuota, requireGatewayProject } from "./gatewayCredentials";
import { compareEvalRuns, evalReceipt, evalRun } from "./gatewayEvalContract";
import { DAY_MS } from "./lib";

function cutoff(retentionDays: number, now: number) {
  return now - Math.max(1, Math.min(365, retentionDays)) * DAY_MS;
}

function lookup(ctx: QueryCtx, projectId: Id<"projects">, runId: string) {
  return ctx.db.query("gatewayEvalRuns")
    .withIndex("by_projectId_and_runId", (q) => q.eq("projectId", projectId).eq("runId", runId)).unique();
}

export const receive = internalMutation({
  args: { ...evalRun.pick("runId", "baselineRunId", "report").fields, keyHash: v.string(), payloadHash: v.string() },
  returns: evalReceipt,
  handler: async (ctx, { keyHash, payloadHash, runId, baselineRunId, report }) => {
    const { credential, workspace } = await authenticateGateway(ctx, keyHash, "ingest");
    await consumeGatewayQuota(ctx, credential._id, "ingest");
    const { workspaceId, projectId } = credential;
    const now = Date.now();
    const earliest = cutoff(workspace.retentionDays, now);
    const existing = await lookup(ctx, projectId, runId);
    if (existing) {
      if (existing.workspaceId !== workspaceId) throw new ConvexError("INVALID_GATEWAY_CREDENTIAL");
      if (existing.payloadHash !== payloadHash || existing.createdAt < earliest) {
        throw new ConvexError("GATEWAY_EVAL_RUN_CONFLICT");
      }
      await ctx.db.patch("gatewayCredentials", credential._id, { lastSuccessAt: now });
      return { runId, status: "replay" as const, gate: existing.gate };
    }

    let gate = null;
    if (baselineRunId !== undefined) {
      const baseline = await lookup(ctx, projectId, baselineRunId);
      if (!baseline || baseline.workspaceId !== workspaceId || baseline.createdAt < earliest) {
        throw new ConvexError("GATEWAY_EVAL_BASELINE_NOT_FOUND");
      }
      gate = compareEvalRuns(report, baseline.report);
      if (!gate) throw new ConvexError("GATEWAY_EVAL_BASELINE_MISMATCH");
    }
    await ctx.db.insert("gatewayEvalRuns", {
      workspaceId, projectId, payloadHash, runId, baselineRunId, report, gate, createdAt: now,
    });
    await ctx.db.patch("gatewayCredentials", credential._id, { lastSuccessAt: now });
    return { runId, status: "accepted" as const, gate };
  },
});

export const list = query({
  args: { projectId: v.id("projects") },
  returns: v.object({ runs: v.array(evalRun) }),
  handler: async (ctx, { projectId }) => {
    const { workspace } = await requireWorkspaceAccess(ctx, "finance:read");
    await requireGatewayProject(ctx, projectId, workspace._id);
    const rows = await ctx.db.query("gatewayEvalRuns")
      .withIndex("by_projectId_and_createdAt", (q) => q.eq("projectId", projectId).gte("createdAt", cutoff(workspace.retentionDays, Date.now())))
      .order("desc").take(20);
    return {
      runs: rows.filter((row) => row.workspaceId === workspace._id)
        .map(({ runId, baselineRunId, createdAt, report, gate }) => ({ runId, baselineRunId, createdAt, report, gate })),
    };
  },
});
