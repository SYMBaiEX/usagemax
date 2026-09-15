import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { audit, requireWorkspaceAccess } from "./account";
import { isValidHistoricalDay } from "./lib";
import { validCurrency, validMoney } from "./productPolicy";

export const moneyBasis = v.union(
  v.literal("estimated"),
  v.literal("reported"),
  v.literal("billed"),
);
export const ledgerInput = v.object({
  externalKey: v.string(),
  provider: v.string(),
  account: v.string(),
  day: v.string(),
  currency: v.string(),
  amountMicros: v.number(),
  kind: v.union(
    v.literal("usage"),
    v.literal("subscription"),
    v.literal("credit"),
    v.literal("adjustment"),
  ),
  basis: moneyBasis,
  invoiceId: v.optional(v.string()),
  model: v.optional(v.string()),
  person: v.optional(v.string()),
  projectId: v.optional(v.id("projects")),
  teamId: v.optional(v.id("teams")),
  note: v.string(),
});
export type LedgerInput = typeof ledgerInput.type;

export function validateEntry(entry: LedgerInput) {
  if (
    !validMoney(
      entry.amountMicros,
      entry.kind === "credit" || entry.kind === "adjustment",
    )
  )
    throw new ConvexError("INVALID_AMOUNT");
  if (!validCurrency(entry.currency)) throw new ConvexError("INVALID_CURRENCY");
  if (!isValidHistoricalDay(entry.day)) throw new ConvexError("INVALID_DAY");
  if (
    !entry.externalKey.trim() ||
    entry.externalKey.length > 200 ||
    !entry.provider.trim() ||
    entry.provider.length > 80 ||
    entry.account.length > 100 ||
    entry.note.length > 500 ||
    (entry.person?.length ?? 0) > 254 ||
    (entry.model?.length ?? 0) > 100 ||
    (entry.invoiceId?.length ?? 0) > 100
  )
    throw new ConvexError("INVALID_ENTRY");
  if (entry.kind === "credit" && entry.amountMicros > 0)
    throw new ConvexError("CREDIT_MUST_BE_NEGATIVE");
}

async function updateRollups(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  entry: LedgerInput,
  sign: 1 | -1,
) {
  const amount = entry.amountMicros * sign;
  const daily = await ctx.db
    .query("financialDaily")
    .withIndex("by_workspaceId_and_day_and_currency_and_basis", (q) =>
      q
        .eq("workspaceId", workspaceId)
        .eq("day", entry.day)
        .eq("currency", entry.currency)
        .eq("basis", entry.basis),
    )
    .unique();
  const monthly = await ctx.db
    .query("financialMonthly")
    .withIndex("by_workspaceId_and_month_and_currency_and_basis", (q) =>
      q
        .eq("workspaceId", workspaceId)
        .eq("month", entry.day.slice(0, 7))
        .eq("currency", entry.currency)
        .eq("basis", entry.basis),
    )
    .unique();
  for (const current of [daily, monthly])
    if (current && !Number.isSafeInteger(current.amountMicros + amount))
      throw new ConvexError("MONEY_OVERFLOW");
  if (daily)
    await ctx.db.patch(daily._id, {
      amountMicros: daily.amountMicros + amount,
      entries: daily.entries + sign,
      updatedAt: Date.now(),
    });
  else
    await ctx.db.insert("financialDaily", {
      workspaceId,
      day: entry.day,
      currency: entry.currency,
      basis: entry.basis,
      amountMicros: amount,
      entries: sign,
      updatedAt: Date.now(),
    });
  if (monthly)
    await ctx.db.patch(monthly._id, {
      amountMicros: monthly.amountMicros + amount,
      entries: monthly.entries + sign,
      updatedAt: Date.now(),
    });
  else
    await ctx.db.insert("financialMonthly", {
      workspaceId,
      month: entry.day.slice(0, 7),
      currency: entry.currency,
      basis: entry.basis,
      amountMicros: amount,
      entries: sign,
      updatedAt: Date.now(),
    });
}

export async function writeLedgerEntry(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  entry: LedgerInput,
  provenance: {
    source: "manual" | "provider";
    connectionId?: Id<"providerConnections">;
    createdBy?: Id<"users">;
  },
) {
  validateEntry(entry);
  if (
    entry.projectId &&
    (await ctx.db.get(entry.projectId))?.workspaceId !== workspaceId
  )
    throw new ConvexError("PROJECT_NOT_FOUND");
  if (
    entry.teamId &&
    (await ctx.db.get(entry.teamId))?.workspaceId !== workspaceId
  )
    throw new ConvexError("TEAM_NOT_FOUND");
  const existing = await ctx.db
    .query("financialEntries")
    .withIndex("by_workspaceId_and_externalKey", (q) =>
      q.eq("workspaceId", workspaceId).eq("externalKey", entry.externalKey),
    )
    .unique();
  if (
    existing &&
    (existing.source !== provenance.source ||
      existing.connectionId !== provenance.connectionId)
  )
    throw new ConvexError("ENTRY_SOURCE_CONFLICT");
  // Provider refreshes preserve reviewed allocation and do not create audit churn.
  if (existing && provenance.source === "provider")
    entry = {
      ...entry,
      projectId: existing.projectId,
      teamId: existing.teamId,
    };
  const fields = Object.keys(ledgerInput.fields) as (keyof LedgerInput)[];
  if (existing && fields.every((field) => existing[field] === entry[field]))
    return { id: existing._id, replay: true };
  if (existing) await updateRollups(ctx, workspaceId, existing, -1);
  await updateRollups(ctx, workspaceId, entry, 1);
  const values = { ...entry, ...provenance, updatedAt: Date.now() };
  const id = existing
    ? (await ctx.db.patch(existing._id, values), existing._id)
    : await ctx.db.insert("financialEntries", {
        workspaceId,
        ...values,
        createdAt: Date.now(),
      });
  await audit(
    ctx,
    workspaceId,
    provenance.createdBy,
    existing ? "ledger.corrected" : "ledger.recorded",
    "financial_entry",
    id,
    `${entry.basis} ${entry.currency} entry ${existing ? "corrected" : "recorded"}; kept separate from token totals`,
  );
  return { id, replay: false };
}

export const record = mutation({
  args: { entries: v.array(ledgerInput) },
  handler: async (ctx, args) => {
    const { workspace, user } = await requireWorkspaceAccess(
      ctx,
      "finance:manage",
    );
    if (!args.entries.length || args.entries.length > 50)
      throw new ConvexError("IMPORT_BATCH_LIMIT_50");
    let changed = 0;
    for (const row of args.entries) {
      const result = await writeLedgerEntry(
        ctx,
        workspace._id,
        { ...row, externalKey: `manual:${row.externalKey}` },
        { source: "manual", createdBy: user._id },
      );
      if (!result.replay) changed++;
    }
    return { received: args.entries.length, changed };
  },
});

export const entries = query({
  args: {
    startDay: v.string(),
    endDay: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccess(ctx, "finance:read");
    if (args.startDay > args.endDay) throw new ConvexError("INVALID_RANGE");
    return await ctx.db
      .query("financialEntries")
      .withIndex("by_workspaceId_and_day", (q) =>
        q
          .eq("workspaceId", workspace._id)
          .gte("day", args.startDay)
          .lte("day", args.endDay),
      )
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const summary = query({
  args: { month: v.string() },
  handler: async (ctx, args) => {
    const { workspace, profile } = await requireWorkspaceAccess(
      ctx,
      "finance:read",
    );
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(args.month))
      throw new ConvexError("INVALID_MONTH");
    const totals = await ctx.db
      .query("financialMonthly")
      .withIndex("by_workspaceId_and_month_and_currency_and_basis", (q) =>
        q.eq("workspaceId", workspace._id).eq("month", args.month),
      )
      .take(601);
    const personalEstimate = await ctx.db
      .query("profileDailyTotals")
      .withIndex("by_profileId_and_day", (q) =>
        q
          .eq("profileId", profile._id)
          .gte("day", `${args.month}-01`)
          .lte("day", `${args.month}-31`),
      )
      .take(31);
    return {
      totals: totals.slice(0, 600).filter((t) => t.entries > 0),
      truncated: totals.length > 600,
      trackedEstimateMicros: personalEstimate.reduce(
        (sum, day) => sum + day.costMicros,
        0,
      ),
      estimateCurrency: "USD",
      explanation:
        "Recorded ledger categories are separate views, not amounts to add together. Tracked cost is not an invoice; its source may be reported, estimated or API-equivalent.",
    };
  },
});

export const allocate = mutation({
  args: {
    entryId: v.id("financialEntries"),
    projectId: v.optional(v.id("projects")),
    teamId: v.optional(v.id("teams")),
  },
  handler: async (ctx, args) => {
    const { workspace, user } = await requireWorkspaceAccess(
      ctx,
      "finance:manage",
    );
    const row = await ctx.db.get(args.entryId);
    if (row?.workspaceId !== workspace._id)
      throw new ConvexError("ENTRY_NOT_FOUND");
    if (
      args.projectId &&
      (await ctx.db.get(args.projectId))?.workspaceId !== workspace._id
    )
      throw new ConvexError("PROJECT_NOT_FOUND");
    if (
      args.teamId &&
      (await ctx.db.get(args.teamId))?.workspaceId !== workspace._id
    )
      throw new ConvexError("TEAM_NOT_FOUND");
    await ctx.db.patch(row._id, {
      projectId: args.projectId,
      teamId: args.teamId,
      updatedAt: Date.now(),
    });
    await audit(
      ctx,
      workspace._id,
      user._id,
      "ledger.allocated",
      "financial_entry",
      row._id,
      `Allocation changed from ${row.teamId ?? "unallocated"}/${row.projectId ?? "unallocated"} to ${args.teamId ?? "unallocated"}/${args.projectId ?? "unallocated"}`,
    );
  },
});

export const reconciliation = query({
  args: { month: v.string(), currency: v.string() },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccess(ctx, "finance:read");
    const rows = await ctx.db
      .query("financialMonthly")
      .withIndex("by_workspaceId_and_month_and_currency_and_basis", (q) =>
        q
          .eq("workspaceId", workspace._id)
          .eq("month", args.month)
          .eq("currency", args.currency),
      )
      .take(3);
    const billed = rows.find((r) => r.basis === "billed" && r.entries > 0);
    const reported = rows.find((r) => r.basis === "reported" && r.entries > 0);
    return {
      billedMicros: billed?.amountMicros ?? null,
      reportedMicros: reported?.amountMicros ?? null,
      differenceMicros:
        billed && reported ? billed.amountMicros - reported.amountMicros : null,
      status:
        !billed || !reported
          ? ("missing_evidence" as const)
          : billed.amountMicros === reported.amountMicros
            ? ("totals_match" as const)
            : ("needs_review" as const),
      note: "Matching monthly totals does not certify individual invoices or coverage. Subscription charges, credits, taxes and unmatched accounts may explain differences.",
    };
  },
});

export async function removeFinancialEntry(
  ctx: MutationCtx,
  entry: Doc<"financialEntries">,
) {
  await updateRollups(ctx, entry.workspaceId, entry, -1);
  await ctx.db.delete(entry._id);
}

export const remove = mutation({
  args: { entryId: v.id("financialEntries") },
  handler: async (ctx, args) => {
    const { workspace, user } = await requireWorkspaceAccess(
      ctx,
      "finance:manage",
    );
    const entry = await ctx.db.get(args.entryId);
    if (entry?.workspaceId !== workspace._id || entry.source !== "manual")
      throw new ConvexError("MANUAL_ENTRY_NOT_FOUND");
    await removeFinancialEntry(ctx, entry);
    await audit(
      ctx,
      workspace._id,
      user._id,
      "ledger.removed",
      "financial_entry",
      args.entryId,
      "Removed manual entry and corrected rollups",
    );
  },
});
