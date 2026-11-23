import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { automaticSnapshotPrice } from "./snapshotPricing";

const version = "2026-11-22.2";
const pageSize = 50;
const cursor = v.union(v.string(), v.null());
const totals = {
  scanned: v.number(),
  corrected: v.number(),
  protectedReported: v.number(),
  insufficientEvidence: v.number(),
  missingProjection: v.number(),
  unchanged: v.number(),
};
const empty = () => ({ scanned: 0, corrected: 0, protectedReported: 0, insufficientEvidence: 0, missingProjection: 0, unchanged: 0 });
type Totals = ReturnType<typeof empty>;
type Snapshot = Doc<"collectorUsageSnapshots">;
type Projection = Doc<"dailyUsage"> | Doc<"profileDailyTotals"> | Doc<"dailyDimensions"> | Doc<"modelTotals"> | Doc<"profileStats">;
const projectionAmount = (row: Projection) => "costMicros" in row ? row.costMicros : row.totalCostMicros;

async function planAdjustment(ctx: MutationCtx, snapshot: Snapshot) {
  const { profileId, workspaceId, collectorId, day, source, provider, model } = snapshot;
  const collector = await ctx.db.get(collectorId);
  const workspace = await ctx.db.get(workspaceId);
  if (!collector?.snapshotBaselineMode || collector.profileId !== profileId || collector.workspaceId !== workspaceId
    || !workspace || workspace.accessDisabledAt !== undefined) return null;
  if (snapshot.seenRunId) {
    const run = await ctx.db.query("snapshotRuns").withIndex("by_collectorId_and_runId",
      (q) => q.eq("collectorId", collectorId).eq("runId", snapshot.seenRunId!)).unique();
    if (run?.status === "uploading") return null;
  }

  const [daily, dailyTotal, sourceTotal, devices, modelTotal, stats, network] = await Promise.all([
    ctx.db.query("dailyUsage").withIndex("by_profileId_and_day_and_source_and_provider_and_model",
      (q) => q.eq("profileId", profileId).eq("day", day).eq("source", source).eq("provider", provider).eq("model", model)).unique(),
    ctx.db.query("profileDailyTotals").withIndex("by_profileId_and_day", (q) => q.eq("profileId", profileId).eq("day", day)).unique(),
    ctx.db.query("dailyDimensions").withIndex("by_profileId_and_dimension_and_day_and_key",
      (q) => q.eq("profileId", profileId).eq("dimension", "source").eq("day", day).eq("key", source)).unique(),
    ctx.db.query("dailyDimensions").withIndex("by_profileId_and_dimension_and_day",
      (q) => q.eq("profileId", profileId).eq("dimension", "device").eq("day", day)).take(101),
    ctx.db.query("modelTotals").withIndex("by_profileId_and_provider_and_model",
      (q) => q.eq("profileId", profileId).eq("provider", provider).eq("model", model)).unique(),
    ctx.db.query("profileStats").withIndex("by_profileId", (q) => q.eq("profileId", profileId)).unique(),
    ctx.db.query("networkCounterShards").withIndex("by_shard",
      (q) => q.eq("shard", [...String(collectorId)].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 128)).unique(),
  ]);
  if (!daily || !dailyTotal || !sourceTotal || !modelTotal || !stats || !network || devices.length > 100) return null;

  // A legacy adoption records a checkpoint without adding its counters to
  // existing totals. Require that the precise source/day/model aggregate
  // matches that checkpoint before treating its estimate as a contribution.
  if (daily.costBasis === "reported") return null;
  if (collector.snapshotBaselineMode !== "native" && (daily.costBasis === "mixed"
    || daily.costMicros !== snapshot.costMicros
    || daily.totalTokens !== snapshot.totalTokens
    || daily.inputTokens !== snapshot.inputTokens || daily.outputTokens !== snapshot.outputTokens
    || daily.cacheReadTokens !== snapshot.cacheReadTokens
    || (daily.cacheWriteTokens ?? 0) !== snapshot.cacheWriteTokens
    || daily.reasoningTokens !== snapshot.reasoningTokens
    || (daily.unclassifiedTokens ?? 0) !== snapshot.unclassifiedTokens)) return null;

  const matchingDevices = devices.filter((device) => device.origin === `collector:${collectorId}`
    || (collector.installationIdHash !== undefined && device.keyHash === collector.installationIdHash));
  const device = matchingDevices.length === 1 ? matchingDevices[0] : null;
  if (!device) return null;
  const rows: Projection[] = [daily, dailyTotal, sourceTotal, device, modelTotal, stats];
  if (rows.some((row) => row.workspaceId !== workspaceId || row.totalTokens < snapshot.totalTokens
    || projectionAmount(row) < snapshot.costMicros) || network.totalCostMicros < snapshot.costMicros) return null;
  return { network, rows, stats };
}

function projectionBasis(row: Projection, priorCost: number) {
  if (row.costBasis === "mixed" || row.costBasis === "reported") return "mixed" as const;
  if (projectionAmount(row) === priorCost || row.costBasis === "api-equivalent") return "api-equivalent" as const;
  return "mixed" as const;
}

async function applyPrice(ctx: MutationCtx, snapshot: Snapshot, plan: NonNullable<Awaited<ReturnType<typeof planAdjustment>>>,
  quote: NonNullable<ReturnType<typeof automaticSnapshotPrice>>, now: number) {
  const delta = quote.costMicros - snapshot.costMicros;
  await ctx.db.patch(snapshot._id, {
    costMicros: quote.costMicros,
    costBasis: "api-equivalent",
    priceCorrection: {
      originalCostMicros: snapshot.priceCorrection?.originalCostMicros ?? snapshot.costMicros,
      rateCardVersion: quote.pricingVersion,
      appliedAt: now,
    },
  });
  for (const row of plan.rows) {
    const changes = { costBasis: projectionBasis(row, snapshot.costMicros), ...("updatedAt" in row ? { updatedAt: now } : {}) };
    if ("costMicros" in row) await ctx.db.patch(row._id, { ...changes, costMicros: row.costMicros + delta });
    else await ctx.db.patch(row._id, { ...changes, totalCostMicros: row.totalCostMicros + delta });
  }
  await ctx.db.patch(plan.network._id, { totalCostMicros: plan.network.totalCostMicros + delta, updatedAt: now });
}

async function scan(ctx: MutationCtx, position: string | null, dryRun: boolean) {
  const page = await ctx.db.query("collectorUsageSnapshots").paginate({ cursor: position, numItems: pageSize });
  const counts = empty();
  const profiles = new Map<Id<"profiles">, Id<"profileStats">>();
  const now = Date.now();
  for (const snapshot of page.page) {
    counts.scanned++;
    if (snapshot.costBasis === "reported") {
      counts.protectedReported++;
      continue;
    }
    const quote = automaticSnapshotPrice(snapshot);
    if (!quote) {
      counts.insufficientEvidence++;
      continue;
    }
    if (snapshot.costMicros === quote.costMicros) {
      counts.unchanged++;
      continue;
    }
    const plan = await planAdjustment(ctx, snapshot);
    if (!plan || !Number.isSafeInteger(plan.network.totalCostMicros + quote.costMicros - snapshot.costMicros)
      || plan.rows.some((row) => !Number.isSafeInteger(projectionAmount(row) + quote.costMicros - snapshot.costMicros))) {
      counts.missingProjection++;
      continue;
    }
    counts.corrected++;
    if (dryRun) continue;
    await applyPrice(ctx, snapshot, plan, quote, now);
    if (plan.stats.summaryScheduledAt === undefined) profiles.set(snapshot.profileId, plan.stats._id);
  }
  for (const [profileId, statsId] of profiles) {
    await ctx.db.patch(statsId, { summaryScheduledAt: now });
    await ctx.scheduler.runAfter(5_000, internal.snapshots.refreshSummary, { profileId, preserveSyncStatus: true });
  }
  return { ...counts, cursor: page.continueCursor, done: page.isDone };
}

export const preview = internalMutation({
  args: { cursor },
  returns: v.object({ ...totals, cursor: v.string(), done: v.boolean() }),
  handler: (ctx, args) => scan(ctx, args.cursor, true),
});

async function currentJob(ctx: Pick<QueryCtx, "db">) {
  return ctx.db.query("snapshotPriceBackfills").withIndex("by_version", (q) => q.eq("version", version)).unique();
}

export const status = internalQuery({
  args: {},
  returns: v.union(v.null(), v.object({ ...totals, status: v.union(v.literal("running"), v.literal("complete")) })),
  handler: async (ctx) => {
    const row = await currentJob(ctx);
    if (!row) return null;
    const summary = Object.fromEntries(Object.keys(totals).map((key) => [key, row[key as keyof Totals]])) as Totals;
    return { ...summary, status: row.status };
  },
});

export const start = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const job = await currentJob(ctx);
    if (!job) await ctx.db.insert("snapshotPriceBackfills", { version, cursor: null, status: "running", ...empty(), updatedAt: Date.now() });
    if (!job || job.status === "running") await ctx.scheduler.runAfter(0, internal.pricingBackfill.processPage, { expectedCursor: job?.cursor ?? null });
    return null;
  },
});

export const resume = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const job = await currentJob(ctx);
    // The first production run starts after its preview. Future card versions
    // resume automatically using that same activation.
    if (!job && !(await ctx.db.query("snapshotPriceBackfills").first())) return null;
    if (job?.status !== "complete") await ctx.scheduler.runAfter(0, internal.pricingBackfill.start, {});
    return null;
  },
});

export const processPage = internalMutation({
  args: { expectedCursor: cursor },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await currentJob(ctx);
    if (!job || job.status !== "running" || job.cursor !== args.expectedCursor) return null;
    const page = await scan(ctx, job.cursor, false);
    const counts = Object.fromEntries(Object.keys(totals).map((key) =>
      [key, job[key as keyof Totals] + page[key as keyof Totals]])) as Totals;
    await ctx.db.patch(job._id, { ...counts, cursor: page.cursor, status: page.done ? "complete" : "running", updatedAt: Date.now() });
    if (!page.done) await ctx.scheduler.runAfter(250, internal.pricingBackfill.processPage, { expectedCursor: page.cursor });
    return null;
  },
});
