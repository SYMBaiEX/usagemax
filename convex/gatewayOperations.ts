import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, query, type QueryCtx } from "./_generated/server";
import { requireWorkspaceAccess } from "./account";
import { gatewayAlertHistory, gatewayFinding } from "./gatewayAlertContract";
import { validateGatewayRange } from "./gatewayContract";
import { activeGatewayProject, authenticateGateway, consumeGatewayQuota, requireGatewayProject } from "./gatewayCredentials";
import { aggregateGateway, gatewayMetrics } from "./gatewayMetrics";
import { DAY_MS } from "./lib";

const reportLimit = 2000;
const alertLimit = 1000;
const alertListLimit = 50;
const hour = 60 * 60_000;
const rangeArgs = { from: v.string(), through: v.string() };
const operations = v.object({
  from: v.string(),
  through: v.string(),
  retainedFromAt: v.number(),
  generatedAt: v.number(),
  latestReceiptAt: v.union(v.null(), v.number()),
  latestRequestId: v.union(v.null(), v.string()),
  recent: v.array(v.object({
    requestId: v.string(), provider: v.string(), model: v.string(), settledAt: v.number(),
    status: v.union(v.literal("ok"), v.literal("error"), v.literal("cancelled")), hasTrace: v.boolean(),
  })),
  truncated: v.boolean(),
  groupsTruncated: v.boolean(),
  limit: v.number(),
  overall: gatewayMetrics,
  daily: v.array(gatewayMetrics),
  providers: v.array(gatewayMetrics),
  models: v.array(gatewayMetrics),
  alerts: gatewayAlertHistory,
});

function receiptRows(ctx: QueryCtx, projectId: Id<"projects">, from: number, to: number, max: number) {
  if (from >= to) return Promise.resolve([]);
  return ctx.db.query("gatewayReceipts")
    .withIndex("by_projectId_and_historyAt", (q) => q.eq("projectId", projectId).gte("historyAt", from).lt("historyAt", to))
    .order("desc").take(max + 1);
}

async function computeReport(
  ctx: QueryCtx, projectId: Id<"projects">, workspaceId: Id<"workspaces">,
  retentionDays: number, now: number, args: { from: string; through: string },
) {
  const { from, through } = validateGatewayRange(args);
  const retainedFromAt = now - Math.max(1, Math.min(365, retentionDays)) * DAY_MS;
  const [rows, active, history, check] = await Promise.all([
    receiptRows(ctx, projectId, Math.max(Date.parse(from), retainedFromAt), Date.parse(through) + DAY_MS, reportLimit),
    ctx.db.query("gatewayAlertEvents").withIndex("by_projectId_and_active", (q) => q.eq("projectId", projectId).eq("active", true))
      .order("desc").take(alertListLimit + 1),
    ctx.db.query("gatewayAlertEvents").withIndex("by_projectId_and_active", (q) => q.eq("projectId", projectId).eq("active", false))
      .order("desc").take(alertListLimit),
    ctx.db.query("gatewayAlertChecks").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).unique(),
  ]);
  const available = rows.slice(0, reportLimit).filter((row) => row.workspaceId === workspaceId);
  const latest = available[0];
  const items = [...active, ...history].slice(0, alertListLimit).filter((row) => row.workspaceId === workspaceId)
    .map(({ key, rule, provider, samples, observed, openedAt, updatedAt, resolvedAt }) => ({
      key, rule, provider, samples, observed, openedAt, updatedAt, ...(resolvedAt === undefined ? {} : { resolvedAt }),
    }));
  return {
    from, through, retainedFromAt, generatedAt: now,
    latestReceiptAt: latest?.historyAt ?? null, latestRequestId: latest?.requestId ?? null,
    truncated: rows.length > reportLimit, limit: reportLimit,
    recent: available.slice(0, 20).map(({ receipt }) => ({
      requestId: receipt.requestId, provider: receipt.provider, model: receipt.model, settledAt: receipt.settledAt,
      status: receipt.status, hasTrace: !!receipt.trace,
    })),
    ...aggregateGateway(available.map(({ receipt }) => receipt)),
    alerts: { items, truncated: (check?.truncated ?? false) || active.length > alertListLimit, evaluatedAt: check?.evaluatedAt ?? null },
  };
}

export const report = internalMutation({
  args: { keyHash: v.string(), ...rangeArgs },
  returns: operations,
  handler: async (ctx, { keyHash, ...args }) => {
    const { credential, workspace } = await authenticateGateway(ctx, keyHash, "report");
    await consumeGatewayQuota(ctx, credential._id, "report");
    const now = Date.now();
    const result = await computeReport(ctx, credential.projectId, workspace._id, workspace.retentionDays, now, args);
    await ctx.db.patch("gatewayCredentials", credential._id, { lastSuccessAt: now });
    return result;
  },
});

export const workspaceReport = query({
  args: { projectId: v.id("projects"), ...rangeArgs },
  returns: operations,
  handler: async (ctx, { projectId, ...args }) => {
    const access = await requireWorkspaceAccess(ctx, "finance:read");
    const { workspace } = await requireGatewayProject(ctx, projectId, access.workspace._id);
    return computeReport(ctx, projectId, workspace._id, workspace.retentionDays, Date.now(), args);
  },
});

export const scheduleAlerts = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("projects").paginate({ numItems: 20, cursor });
    for (const project of page.page) {
      if (project.archivedAt !== undefined) continue;
      const ingest = await ctx.db.query("gatewayCredentials")
        .withIndex("by_projectId_and_revokedAt", (q) => q.eq("projectId", project._id).eq("revokedAt", undefined))
        .first();
      if (ingest) await ctx.scheduler.runAfter(0, internal.gatewayOperations.evaluateAlerts, {
        projectId: project._id, workspaceId: project.workspaceId,
      });
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.gatewayOperations.scheduleAlerts, { cursor: page.continueCursor });
    return null;
  },
});

export const evaluateAlerts = internalMutation({
  args: { projectId: v.id("projects"), workspaceId: v.id("workspaces") },
  returns: v.null(),
  handler: async (ctx, { projectId, workspaceId }) => {
    const target = await activeGatewayProject(ctx, projectId, workspaceId);
    if (!target) return null;
    const now = Date.now();
    const retentionCutoff = now - Math.max(1, Math.min(365, target.workspace.retentionDays)) * DAY_MS;
    const [rows, pending, active, check] = await Promise.all([
      receiptRows(ctx, projectId, Math.max(now - hour, retentionCutoff), now + 1, alertLimit),
      ctx.db.query("gatewayReceipts").withIndex("by_projectId_and_billingPending_and_historyAt",
        (q) => q.eq("projectId", projectId).eq("billingPending", true).gte("historyAt", retentionCutoff))
        .take(alertLimit + 1),
      ctx.db.query("gatewayAlertEvents").withIndex("by_projectId_and_active", (q) => q.eq("projectId", projectId).eq("active", true))
        .take(301),
      ctx.db.query("gatewayAlertChecks").withIndex("by_projectId", (q) => q.eq("projectId", projectId)).unique(),
    ]);
    const { providers, groupsTruncated } = aggregateGateway(rows.slice(0, alertLimit)
      .filter((row) => row.workspaceId === workspaceId).map(({ receipt }) => receipt));
    const truncated = groupsTruncated || rows.length > alertLimit;
    const pendingCounts = new Map<string, number>();
    for (const row of pending.slice(0, alertLimit)) {
      if (row.workspaceId !== workspaceId) continue;
      pendingCounts.set(row.receipt.provider, (pendingCounts.get(row.receipt.provider) ?? 0) + 1);
    }
    const findings: Array<typeof gatewayFinding.type> = [...pendingCounts]
      .slice(0, 100).map(([provider, observed]) => ({
        key: "billing_pending|" + provider, rule: "billing_pending", provider, samples: observed, observed,
      }));
    for (const row of providers) {
      const add = (rule: typeof gatewayFinding.type.rule, samples: number, observed: number) =>
        findings.push({ key: rule + "|" + row.key, rule, provider: row.key, samples, observed });
      if (truncated) continue;
      if (row.providerAttempts >= 5 && row.providerErrors / row.providerAttempts >= 0.2)
        add("provider_errors", row.providerAttempts, Math.round(row.providerErrors / row.providerAttempts * 100));
      if (row.providerLatency && row.providerLatency.samples >= 5 && row.providerLatency.p95 >= 5000)
        add("slow_provider", row.providerLatency.samples, row.providerLatency.p95);
    }
    const open = new Map(active.map((row) => [row.key, row]));
    for (const finding of findings) {
      const existing = open.get(finding.key);
      if (existing) {
        await ctx.db.patch("gatewayAlertEvents", existing._id, { ...finding, updatedAt: now });
        open.delete(finding.key);
      } else {
        await ctx.db.insert("gatewayAlertEvents", { ...finding, projectId, workspaceId, active: true, openedAt: now, updatedAt: now });
      }
    }
    // An incomplete sample cannot establish recovery.
    const pendingTruncated = pending.length > alertLimit || pendingCounts.size > 100;
    for (const row of open.values()) {
      if (row.rule === "billing_pending" ? pendingTruncated : truncated) continue;
      await ctx.db.patch("gatewayAlertEvents", row._id, { active: false, updatedAt: now, resolvedAt: now });
    }
    if (check) await ctx.db.patch("gatewayAlertChecks", check._id, { evaluatedAt: now, truncated: truncated || pendingTruncated });
    else if (rows.length) await ctx.db.insert("gatewayAlertChecks", { projectId, workspaceId, evaluatedAt: now, truncated: truncated || pendingTruncated });
    return null;
  },
});
