import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { audit, requireWorkspaceAccess } from "./account";
import { cleanText } from "./lib";
import { moneyBasis } from "./finance";
import { productPolicy, validCurrency, validMoney } from "./productPolicy";

export async function evaluateBudget(
  ctx: MutationCtx,
  budget: Doc<"budgets">,
  now: number,
) {
  if (!budget.enabled) return;
  const workspace = await ctx.db.get(budget.workspaceId);
  if (!workspace || workspace.accessDisabledAt) return;
  const member = await ctx.db
    .query("workspaceMemberships")
    .withIndex("by_userId_and_workspaceId", (q) =>
      q.eq("userId", budget.ownerId).eq("workspaceId", budget.workspaceId),
    )
    .unique();
  if (member?.status !== "active") return;
  const month = new Date(now).toISOString().slice(0, 7);
  let observedMicros: number | undefined;
  if (budget.source === "tracked") {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspace._id))
      .first();
    if (profile) {
      const rows = await ctx.db
        .query("profileDailyTotals")
        .withIndex("by_profileId_and_day", (q) =>
          q
            .eq("profileId", profile._id)
            .gte("day", `${month}-01`)
            .lte("day", `${month}-31`),
        )
        .take(31);
      if (rows.length)
        observedMicros = rows.reduce((sum, r) => sum + r.costMicros, 0);
    }
  } else {
    const total = await ctx.db
      .query("financialMonthly")
      .withIndex("by_workspaceId_and_month_and_currency_and_basis", (q) =>
        q
          .eq("workspaceId", workspace._id)
          .eq("month", month)
          .eq("currency", budget.currency)
          .eq("basis", budget.basis),
      )
      .unique();
    if (total?.entries) observedMicros = total.amountMicros;
  }
  const preferences = await ctx.db
    .query("preferences")
    .withIndex("by_userId", (q) => q.eq("userId", budget.ownerId))
    .unique();
  const crossed =
    observedMicros !== undefined &&
    observedMicros >= (budget.limitMicros * budget.thresholdPercent) / 100;
  const dedupeKey = `budget:${budget._id}:${month}`;
  const existing = crossed
    ? await ctx.db
        .query("notifications")
        .withIndex("by_workspaceId_and_dedupeKey", (q) =>
          q.eq("workspaceId", workspace._id).eq("dedupeKey", dedupeKey),
        )
        .unique()
    : null;
  if (crossed && !existing && preferences?.notificationBudgets !== false)
    await ctx.db.insert("notifications", {
      workspaceId: workspace._id,
      userId: budget.ownerId,
      dedupeKey,
      kind: "budget",
      title: `${budget.name} reached ${budget.thresholdPercent}%`,
      detail: `${budget.source === "tracked" ? "Tracked cost (not an invoice)" : budget.basis + " ledger cost"} crossed your monthly threshold. This alert does not block provider spending.`,
      createdAt: now,
    });
  await ctx.db.patch(budget._id, {
    observedMicros,
    lastEvaluatedMonth: month,
    evaluatedAt: now,
    ...(crossed ? { lastNotifiedMonth: month } : {}),
  });
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { workspace } = await requireWorkspaceAccess(ctx, "finance:read");
    return await ctx.db
      .query("budgets")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspace._id))
      .take(200);
  },
});

export const save = mutation({
  args: {
    id: v.optional(v.id("budgets")),
    name: v.string(),
    limitMicros: v.number(),
    currency: v.string(),
    source: v.union(v.literal("tracked"), v.literal("ledger")),
    basis: moneyBasis,
    thresholdPercent: v.number(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { workspace, user } = await requireWorkspaceAccess(
      ctx,
      "finance:manage",
    );
    if (
      !validMoney(args.limitMicros) ||
      !args.limitMicros ||
      !validCurrency(args.currency) ||
      !Number.isInteger(args.thresholdPercent) ||
      args.thresholdPercent < 1 ||
      args.thresholdPercent > 100
    )
      throw new ConvexError("INVALID_BUDGET");
    if (args.source === "tracked" && args.currency !== "USD")
      throw new ConvexError("TRACKED_COST_IS_USD");
    const { id, ...input } = args;
    const values = {
      ...input,
      name: cleanText(args.name, "Monthly budget", 80),
    };
    let budgetId = id;
    if (budgetId) {
      if ((await ctx.db.get(budgetId))?.workspaceId !== workspace._id)
        throw new ConvexError("BUDGET_NOT_FOUND");
      await ctx.db.patch(budgetId, values);
    } else {
      const limit = productPolicy(workspace.plan).budgets;
      const existing = await ctx.db
        .query("budgets")
        .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspace._id))
        .take(limit + 1);
      if (existing.length >= limit) throw new ConvexError("BUDGET_LIMIT");
      budgetId = await ctx.db.insert("budgets", {
        workspaceId: workspace._id,
        ownerId: user._id,
        ...values,
        createdAt: Date.now(),
      });
    }
    await evaluateBudget(ctx, (await ctx.db.get(budgetId))!, Date.now());
    await audit(
      ctx,
      workspace._id,
      user._id,
      "budget.saved",
      "budget",
      budgetId,
      "Updated monthly notification budget; no provider enforcement",
    );
    return budgetId;
  },
});

export const remove = mutation({
  args: { id: v.id("budgets") },
  handler: async (ctx, args) => {
    const { workspace, user } = await requireWorkspaceAccess(
      ctx,
      "finance:manage",
    );
    if ((await ctx.db.get(args.id))?.workspaceId !== workspace._id)
      throw new ConvexError("BUDGET_NOT_FOUND");
    await ctx.db.delete(args.id);
    await audit(
      ctx,
      workspace._id,
      user._id,
      "budget.deleted",
      "budget",
      args.id,
      "Deleted budget policy",
    );
  },
});

export const evaluateAll = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("budgets")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .paginate({ numItems: 20, cursor: args.cursor ?? null });
    for (const budget of page.page)
      await evaluateBudget(ctx, budget, Date.now());
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.budgets.evaluateAll, {
        cursor: page.continueCursor,
      });
  },
});
