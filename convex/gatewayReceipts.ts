import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internalMutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { requireWorkspaceAccess } from "./account";
import { gatewayLimits, gatewayPage, gatewayRange, gatewayReceipt, gatewayResult, isGatewayRequestId, validateGatewayRange } from "./gatewayContract";
import { authenticateGateway, consumeGatewayQuota, requireGatewayProject } from "./gatewayCredentials";
import { DAY_MS } from "./lib";

const hashedReceipt = v.object({ receipt: gatewayReceipt, payloadHash: v.string() });
type Result = typeof gatewayResult.type;

function retentionCutoff(retentionDays: number, now: number) {
  return now - Math.max(1, Math.min(365, retentionDays)) * DAY_MS;
}

async function receiptsForProject(
  ctx: QueryCtx,
  projectId: Id<"projects">,
  workspaceId: Id<"workspaces">,
  cutoff: number,
  { from, through, limit }: ReturnType<typeof validateGatewayRange>,
) {
  const start = Math.max(Date.parse(from), cutoff);
  const end = Date.parse(through) + DAY_MS;
  if (start >= end) return { receipts: [], truncated: false };
  const rows = await ctx.db.query("gatewayReceipts")
    .withIndex("by_projectId_and_historyAt", (q) => q.eq("projectId", projectId).gte("historyAt", start).lt("historyAt", end))
    .order("desc").take(limit + 1);
  return {
    receipts: rows.slice(0, limit).filter((row) => row.workspaceId === workspaceId).map(({ receipt }) => receipt),
    truncated: rows.length > limit,
  };
}

async function byRequest(ctx: QueryCtx, projectId: Id<"projects">, requestId: string) {
  return ctx.db.query("gatewayReceipts")
    .withIndex("by_projectId_and_requestId", (q) => q.eq("projectId", projectId).eq("requestId", requestId)).unique();
}

export const receive = internalMutation({
  args: { keyHash: v.string(), receipts: v.array(hashedReceipt) },
  returns: v.object({ results: v.array(gatewayResult) }),
  handler: async (ctx, { keyHash, receipts }) => {
    const { credential, workspace } = await authenticateGateway(ctx, keyHash, "ingest");
    const { workspaceId, projectId } = credential;
    if (!receipts.length || receipts.length > gatewayLimits.batch) throw new ConvexError("INVALID_GATEWAY_BATCH");
    await consumeGatewayQuota(ctx, credential._id, "ingest");
    const now = Date.now();
    const cutoff = retentionCutoff(workspace.retentionDays, now);
    const results: Result[] = [];
    for (const { receipt, payloadHash } of receipts) {
      const { requestId, revision } = receipt;
      const existing = await byRequest(ctx, projectId, requestId);
      if (existing && existing.workspaceId !== workspaceId) throw new ConvexError("INVALID_GATEWAY_CREDENTIAL");
      let status: Result["status"];
      if ((existing?.historyAt ?? receipt.settledAt) < cutoff || (existing && revision < existing.receipt.revision)) {
        status = "stale";
      } else if (existing && revision === existing.receipt.revision) {
        status = existing.payloadHash === payloadHash ? "replay" : "conflict";
      } else if (existing && existing.historyAt !== receipt.settledAt) {
        status = "conflict";
      } else {
        const billingPending = receipt.trace?.billingStatus === "pending" ? true : undefined;
        if (existing) {
          // The first accepted receipt fixes the request's reporting date and retention horizon.
          await ctx.db.patch("gatewayReceipts", existing._id, { receipt, payloadHash, billingPending });
        } else {
          await ctx.db.insert("gatewayReceipts", {
            workspaceId, projectId, requestId, historyAt: receipt.settledAt, receipt, payloadHash, ...(billingPending ? { billingPending } : {}),
          });
        }
        status = "accepted";
      }
      results.push({ requestId, revision, status });
    }
    if (results.some(({ status }) => status === "accepted" || status === "replay")) {
      await ctx.db.patch("gatewayCredentials", credential._id, { lastSuccessAt: now });
    }
    return { results };
  },
});

export const list = query({
  args: { projectId: v.id("projects"), ...gatewayRange },
  returns: gatewayPage,
  handler: async (ctx, { projectId, ...args }) => {
    const access = await requireWorkspaceAccess(ctx, "finance:read");
    await requireGatewayProject(ctx, projectId, access.workspace._id);
    return receiptsForProject(ctx, projectId, access.workspace._id, retentionCutoff(access.workspace.retentionDays, Date.now()), validateGatewayRange(args));
  },
});

export const get = query({
  args: { projectId: v.id("projects"), requestId: v.string() },
  returns: v.union(gatewayReceipt, v.null()),
  handler: async (ctx, { projectId, requestId }) => {
    const access = await requireWorkspaceAccess(ctx, "finance:read");
    await requireGatewayProject(ctx, projectId, access.workspace._id);
    if (!isGatewayRequestId(requestId)) return null;
    const row = await byRequest(ctx, projectId, requestId);
    return row?.workspaceId === access.workspace._id && row.historyAt >= retentionCutoff(access.workspace.retentionDays, Date.now())
      ? row.receipt : null;
  },
});

export const report = internalMutation({
  args: { keyHash: v.string(), ...gatewayRange },
  returns: gatewayPage,
  handler: async (ctx, { keyHash, ...args }) => {
    const { credential, workspace } = await authenticateGateway(ctx, keyHash, "report");
    await consumeGatewayQuota(ctx, credential._id, "report");
    const now = Date.now();
    const results = await receiptsForProject(ctx, credential.projectId, credential.workspaceId, retentionCutoff(workspace.retentionDays, now), validateGatewayRange(args));
    await ctx.db.patch("gatewayCredentials", credential._id, { lastSuccessAt: now });
    return results;
  },
});

export const detail = internalMutation({
  args: { keyHash: v.string(), requestId: v.string() },
  returns: v.union(v.object({ receipt: gatewayReceipt }), v.null()),
  handler: async (ctx, { keyHash, requestId }) => {
    const { credential, workspace } = await authenticateGateway(ctx, keyHash, "report");
    await consumeGatewayQuota(ctx, credential._id, "report");
    const row = await byRequest(ctx, credential.projectId, requestId);
    const now = Date.now();
    if (!row || row.workspaceId !== credential.workspaceId || row.historyAt < retentionCutoff(workspace.retentionDays, now)) return null;
    await ctx.db.patch("gatewayCredentials", credential._id, { lastSuccessAt: now });
    return { receipt: row.receipt };
  },
});
