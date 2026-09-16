import { ConvexError, v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { DAY_MS, dayFromTimestamp } from "./lib";
import { enforceCollectorRateLimit } from "./rateLimits";
import { assertCollectorMembership } from "./collectorAccess";
import { ensureProfileDevice } from "./devices";

const costBasisValidator = v.union(
  v.literal("reported"),
  v.literal("estimated"),
  v.literal("api-equivalent"),
  v.literal("unknown"),
);

const countersValidator = v.object({
  inputTokens: v.number(),
  outputTokens: v.number(),
  cacheReadTokens: v.number(),
  cacheWriteTokens: v.number(),
  reasoningTokens: v.number(),
  unclassifiedTokens: v.number(),
  totalTokens: v.number(),
  costMicros: v.number(),
  requests: v.number(),
  errors: v.number(),
});

const rowValidator = v.object({
  provider: v.string(),
  model: v.string(),
  previous: countersValidator,
  current: countersValidator,
  costBasis: costBasisValidator,
  contentHash: v.string(),
  lastUsedAt: v.number(),
});

const sessionValidator = v.object({
  source: v.string(),
  sessionKey: v.string(),
  firstActivityAt: v.optional(v.number()),
  lastActivityAt: v.optional(v.number()),
});

type Counters = typeof countersValidator.type;
type Basis = typeof costBasisValidator.type | "mixed";
type Collector = Doc<"collectors">;

const counterFields = [
  "inputTokens",
  "outputTokens",
  "cacheReadTokens",
  "cacheWriteTokens",
  "reasoningTokens",
  "unclassifiedTokens",
  "totalTokens",
  "costMicros",
  "requests",
  "errors",
] as const;

const zeroCounters = (): Counters => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  reasoningTokens: 0,
  unclassifiedTokens: 0,
  totalTokens: 0,
  costMicros: 0,
  requests: 0,
  errors: 0,
});

function add(target: Counters, source: Counters) {
  for (const field of counterFields) target[field] += source[field];
}

function subtract(left: Counters, right: Counters): Counters {
  return Object.fromEntries(counterFields.map((field) => [field, left[field] - right[field]])) as Counters;
}

function isZero(value: Counters) {
  return counterFields.every((field) => value[field] === 0);
}

function validateCounters(value: Counters) {
  for (const field of counterFields) {
    if (!Number.isSafeInteger(value[field]) || value[field] < 0) throw new ConvexError("INVALID_SNAPSHOT_COUNTER");
  }
  const classified = value.inputTokens + value.outputTokens + value.cacheReadTokens + value.cacheWriteTokens + value.reasoningTokens + value.unclassifiedTokens;
  if (classified !== value.totalTokens) throw new ConvexError("INVALID_SNAPSHOT_TOTAL");
}

function nextValue(current: number, delta: number) {
  const next = current + delta;
  if (!Number.isSafeInteger(next) || next < 0) throw new ConvexError("PROJECTION_UNDERFLOW");
  return next;
}

function mergeBasis(left: Basis | undefined, right: Basis | undefined): Basis | undefined {
  if (!right) return left;
  if (!left || left === right) return right;
  return "mixed";
}

function minOptional(left: number | undefined, right: number | undefined) {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return Math.min(left, right);
}

function maxOptional(left: number | undefined, right: number | undefined) {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return Math.max(left, right);
}

async function collectorForKey(ctx: MutationCtx, keyHash: string, installationIdHash?: string) {
  const collector = await ctx.db.query("collectors").withIndex("by_keyHash", (q) => q.eq("keyHash", keyHash)).unique();
  if (!collector || collector.revokedAt || !collector.scopes.includes("telemetry:write")) throw new ConvexError("INVALID_COLLECTOR");
  await assertCollectorMembership(ctx, collector);
  if (collector.installationIdHash && installationIdHash && collector.installationIdHash !== installationIdHash) {
    throw new ConvexError("DEVICE_ID_MISMATCH");
  }
  if (!collector.installationIdHash && installationIdHash) {
    await ctx.db.patch(collector._id, { installationIdHash });
    return { ...collector, installationIdHash };
  }
  return collector;
}

function streakMetrics(days: string[], now: number) {
  const ordered = [...new Set(days)].sort();
  let longest = 0;
  let run = 0;
  let previous = Number.NaN;
  for (const day of ordered) {
    const index = Math.floor(Date.parse(`${day}T00:00:00.000Z`) / DAY_MS);
    run = index === previous + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = index;
  }
  const latest = ordered.at(-1);
  const latestIndex = latest ? Math.floor(Date.parse(`${latest}T00:00:00.000Z`) / DAY_MS) : Number.NaN;
  const todayIndex = Math.floor(now / DAY_MS);
  return { current: todayIndex - latestIndex <= 1 ? run : 0, longest };
}

async function updateNetwork(ctx: MutationCtx, collector: Collector, delta: Counters, sessionDelta: number, day: string, now: number) {
  const shard = [...String(collector._id)].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 128;
  const currentDay = dayFromTimestamp(now);
  const network = await ctx.db.query("networkCounterShards").withIndex("by_shard", (q) => q.eq("shard", shard)).unique();
  if (network) {
    await ctx.db.patch(network._id, {
      totalTokens: nextValue(network.totalTokens, delta.totalTokens),
      totalCostMicros: nextValue(network.totalCostMicros, delta.costMicros),
      totalSessions: nextValue(network.totalSessions, sessionDelta),
      eventsDay: currentDay,
      eventsToday: network.eventsDay === currentDay
        ? nextValue(network.eventsToday, day === currentDay ? delta.requests : 0)
        : Math.max(0, day === currentDay ? delta.requests : 0),
      updatedAt: now,
    });
  } else {
    if (delta.totalTokens < 0 || delta.costMicros < 0 || sessionDelta < 0) throw new ConvexError("PROJECTION_UNDERFLOW");
    await ctx.db.insert("networkCounterShards", {
      shard,
      totalTokens: delta.totalTokens,
      totalCostMicros: delta.costMicros,
      totalSessions: sessionDelta,
      profiles: 0,
      eventsDay: currentDay,
      eventsToday: day === currentDay ? delta.requests : 0,
      updatedAt: now,
    });
  }
}

export const beginRun = internalMutation({
  args: {
    keyHash: v.string(),
    installationIdHash: v.optional(v.string()),
    runId: v.string(),
    mode: v.union(v.literal("incremental"), v.literal("full"), v.literal("archives")),
    requestedBaselineMode: v.optional(v.union(v.literal("apply"), v.literal("adopt-current"))),
    sourceCount: v.number(),
    partitionCount: v.number(),
    inventoryComplete: v.boolean(),
    inventoryErrors: v.number(),
    inventoryTruncated: v.boolean(),
    coverageStartDay: v.optional(v.string()),
    coverageEndDay: v.optional(v.string()),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const collector = await collectorForKey(ctx, args.keyHash, args.installationIdHash);
    const prior = await ctx.db
      .query("snapshotRuns")
      .withIndex("by_collectorId_and_runId", (q) => q.eq("collectorId", collector._id).eq("runId", args.runId))
      .unique();
    if (prior?.status === "failed") throw new ConvexError("SNAPSHOT_RUN_EXPIRED");
    if (prior) return { replay: true, status: prior.status, acceptedPartitions: prior.acceptedPartitions };
    await enforceCollectorRateLimit(ctx, String(collector._id));
    const baselineMode = collector.snapshotBaselineMode !== undefined
        ? "apply" as const
        : args.requestedBaselineMode === "adopt-current"
          ? "adopt-current" as const
          : "apply" as const;
    await ctx.db.insert("snapshotRuns", {
      workspaceId: collector.workspaceId,
      profileId: collector.profileId,
      collectorId: collector._id,
      runId: args.runId,
      mode: args.mode,
      baselineMode,
      status: "uploading",
      sourceCount: Math.max(0, Math.round(args.sourceCount)),
      partitionCount: Math.max(0, Math.round(args.partitionCount)),
      acceptedPartitions: 0,
      changedRows: 0,
      correctionRows: 0,
      inventoryComplete: args.inventoryComplete,
      inventoryErrors: Math.max(0, Math.round(args.inventoryErrors)),
      inventoryTruncated: args.inventoryTruncated,
      coverageStartDay: args.coverageStartDay,
      coverageEndDay: args.coverageEndDay,
      startedAt: args.now,
      updatedAt: args.now,
    });
    await ctx.db.patch(collector._id, {
      lastSeenAt: args.now,
      lastSyncRunId: args.runId,
      lastSyncPhase: "uploading",
    });
    return { replay: false, status: "uploading" as const, acceptedPartitions: 0, baselineMode };
  },
});

export const commitSessions = internalMutation({
  args: {
    keyHash: v.string(),
    installationIdHash: v.optional(v.string()),
    runId: v.string(),
    sessions: v.array(sessionValidator),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const collector = await collectorForKey(ctx, args.keyHash, args.installationIdHash);
    await enforceCollectorRateLimit(ctx, String(collector._id), args.sessions.length);
    const run = await ctx.db.query("snapshotRuns").withIndex("by_collectorId_and_runId", (q) =>
      q.eq("collectorId", collector._id).eq("runId", args.runId),
    ).unique();
    if (!run || run.status === "failed") throw new ConvexError("SNAPSHOT_RUN_EXPIRED");
    let inserted = 0;
    for (const session of args.sessions) {
      const prior = await ctx.db.query("collectorSessions").withIndex("by_collectorId_and_source_and_sessionKey", (q) =>
        q.eq("collectorId", collector._id).eq("source", session.source).eq("sessionKey", session.sessionKey),
      ).unique();
      if (prior) {
        await ctx.db.patch(prior._id, {
          firstActivityAt: minOptional(prior.firstActivityAt, session.firstActivityAt),
          lastActivityAt: maxOptional(prior.lastActivityAt, session.lastActivityAt),
          updatedAt: args.now,
        });
      } else {
        await ctx.db.insert("collectorSessions", {
          workspaceId: collector.workspaceId,
          profileId: collector.profileId,
          collectorId: collector._id,
          ...session,
          discoveredAt: args.now,
          updatedAt: args.now,
        });
        inserted += 1;
      }
    }
    if (inserted > 0) {
      const stats = await ctx.db.query("profileStats").withIndex("by_profileId", (q) => q.eq("profileId", collector.profileId)).unique();
      if (stats) await ctx.db.patch(stats._id, { sessions: stats.sessions + inserted, updatedAt: args.now });
      await updateNetwork(ctx, collector, zeroCounters(), inserted, dayFromTimestamp(args.now), args.now);
    }
    return { accepted: inserted, duplicates: args.sessions.length - inserted };
  },
});

export const commitPartition = internalMutation({
  args: {
    keyHash: v.string(),
    installationIdHash: v.optional(v.string()),
    runId: v.string(),
    partitionId: v.string(),
    payloadHash: v.string(),
    revision: v.number(),
    source: v.string(),
    day: v.string(),
    complete: v.boolean(),
    pricingVersion: v.optional(v.string()),
    chunkIndex: v.optional(v.number()),
    chunkCount: v.optional(v.number()),
    // Internal scheduler-only continuation; never accepted from HTTP input.
    cleanupCursor: v.optional(v.union(v.string(), v.null())),
    rows: v.array(rowValidator),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const collector = await collectorForKey(ctx, args.keyHash, args.installationIdHash);
    const run = await ctx.db.query("snapshotRuns").withIndex("by_collectorId_and_runId", (q) =>
      q.eq("collectorId", collector._id).eq("runId", args.runId),
    ).unique();
    if (!run || run.status === "failed") throw new ConvexError("SNAPSHOT_RUN_EXPIRED");
    const receipt = await ctx.db.query("snapshotReceipts").withIndex("by_collectorId_and_partitionId", (q) =>
      q.eq("collectorId", collector._id).eq("partitionId", args.partitionId),
    ).unique();
    if (receipt) {
      if (receipt.payloadHash !== args.payloadHash) throw new ConvexError("IDEMPOTENCY_CONFLICT");
      return { replay: true, changedRows: receipt.changedRows, correctionRows: receipt.correctionRows };
    }
    if (run.status !== "uploading") throw new ConvexError("SNAPSHOT_RUN_CLOSED");
    const chunked = args.chunkIndex !== undefined || args.chunkCount !== undefined;
    const cleaning = args.cleanupCursor !== undefined;
    let group = chunked || cleaning ? await ctx.db.query("snapshotChunkGroups")
      .withIndex("by_collectorId_and_runId_and_source_and_day", q => q.eq("collectorId", collector._id).eq("runId", args.runId).eq("source", args.source).eq("day", args.day)).unique() : null;
    if (chunked && !cleaning) {
      if (!Number.isSafeInteger(args.chunkCount) || !Number.isSafeInteger(args.chunkIndex)
        || args.chunkCount! < 1 || args.chunkCount! > 10000 || args.chunkIndex! < 0 || args.chunkIndex! >= args.chunkCount!) throw new ConvexError("INVALID_SNAPSHOT_CHUNK");
      if (group && (group.revision !== args.revision || group.chunkCount !== args.chunkCount || group.complete !== args.complete || group.pricingVersion !== args.pricingVersion)) throw new ConvexError("SNAPSHOT_MANIFEST_CONFLICT");
      if ((group?.nextChunk ?? 0) !== args.chunkIndex) throw new ConvexError("SNAPSHOT_CHUNK_OUT_OF_ORDER");
      if (!group) {
        const id = await ctx.db.insert("snapshotChunkGroups", { collectorId: collector._id, runId: args.runId, source: args.source, day: args.day, revision: args.revision, chunkCount: args.chunkCount!, nextChunk: 0, complete: args.complete, pricingVersion: args.pricingVersion, done: false, updatedAt: args.now });
        group = (await ctx.db.get(id))!;
      }
    }
    if (cleaning && (!group || group.done || group.nextChunk !== group.chunkCount)) throw new ConvexError("INVALID_SNAPSHOT_CLEANUP");
    // Cleanup is a bounded, server-issued continuation of an already admitted write.
    if (!cleaning) await enforceCollectorRateLimit(ctx, String(collector._id), args.rows.length);
    const head = await ctx.db.query("snapshotPartitionHeads").withIndex("by_collectorId_and_source_and_day", q => q.eq("collectorId", collector._id).eq("source", args.source).eq("day", args.day)).unique();
    if (head && head.runId !== args.runId && head.revision >= args.revision) {
      if (!cleaning) throw new ConvexError("STALE_SNAPSHOT_REVISION");
      // A newer run superseded this cleanup. Never delete its rows.
      await ctx.db.patch(group!._id, { done: true, updatedAt: args.now });
      await ctx.db.patch(run._id, { pendingCleanups: Math.max(0, (run.pendingCleanups ?? 0) - 1) });
      return { replay: false, changedRows: 0, correctionRows: 0 };
    }
    if (!head) await ctx.db.insert("snapshotPartitionHeads", { collectorId: collector._id, source: args.source, day: args.day, runId: args.runId, revision: args.revision });
    else if (head.runId !== args.runId) await ctx.db.patch(head._id, { runId: args.runId, revision: args.revision });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.day) || args.rows.length > 100) throw new ConvexError("INVALID_SNAPSHOT_PARTITION");
    const uniqueRows = new Map<string, (typeof args.rows)[number]>();
    for (const row of args.rows) {
      validateCounters(row.previous);
      validateCounters(row.current);
      const key = `${row.provider}\u001f${row.model}`;
      if (uniqueRows.has(key)) throw new ConvexError("DUPLICATE_SNAPSHOT_ROW");
      uniqueRows.set(key, row);
    }
    const partitionQuery = ctx.db.query("collectorUsageSnapshots").withIndex("by_collectorId_and_source_and_day", (q) =>
      q.eq("collectorId", collector._id).eq("source", args.source).eq("day", args.day),
    );
    const cleanupPage = cleaning ? await partitionQuery.paginate({ cursor: args.cleanupCursor!, numItems: 100 }) : null;
    const priorSnapshots = cleanupPage ? cleanupPage.page.filter(row => row.seenRunId !== args.runId && row.revision <= args.revision)
      : chunked ? (await Promise.all(args.rows.map(row => ctx.db.query("collectorUsageSnapshots").withIndex("by_collectorId_and_source_and_day_and_provider_and_model", q => q.eq("collectorId", collector._id).eq("source", args.source).eq("day", args.day).eq("provider", row.provider).eq("model", row.model)).unique()))).filter((row): row is Doc<"collectorUsageSnapshots"> => row !== null)
      : await partitionQuery.take(101);
    if (!chunked && !cleaning && priorSnapshots.length > 100) throw new ConvexError("SNAPSHOT_CHUNKING_REQUIRED");
    if (priorSnapshots.some((row) => row.revision > args.revision)) throw new ConvexError("STALE_SNAPSHOT_REVISION");
    const changes: Array<{
      provider: string;
      model: string;
      current: Counters;
      delta: Counters;
      basis: typeof costBasisValidator.type;
      contentHash: string;
      lastUsedAt: number;
      prior?: (typeof priorSnapshots)[number];
    }> = [];
    for (const row of uniqueRows.values()) {
      const prior = priorSnapshots.find((candidate) => candidate.provider === row.provider && candidate.model === row.model);
      const base = run.baselineMode === "adopt-current"
        ? row.current
        : prior
          ? Object.fromEntries(counterFields.map((field) => [field, prior[field]])) as Counters
          : row.previous;
      // A partial scan is not authoritative evidence for any downward correction.
      if ((!args.complete || !run.inventoryComplete || run.inventoryErrors > 0 || run.inventoryTruncated)
        && counterFields.some(field => row.current[field] < base[field])) continue;
      changes.push({
        provider: row.provider,
        model: row.model,
        current: row.current,
        delta: subtract(row.current, base),
        basis: row.costBasis,
        contentHash: row.contentHash,
        lastUsedAt: row.lastUsedAt,
        prior,
      });
    }
    if (args.complete && (!chunked || cleaning) && run.inventoryComplete && run.inventoryErrors === 0 && !run.inventoryTruncated) {
      for (const prior of priorSnapshots) {
        if (uniqueRows.has(`${prior.provider}\u001f${prior.model}`)) continue;
        const current = zeroCounters();
        const base = Object.fromEntries(counterFields.map((field) => [field, prior[field]])) as Counters;
        changes.push({
          provider: prior.provider,
          model: prior.model,
          current,
          delta: subtract(current, base),
          basis: prior.costBasis,
          contentHash: "removed",
          lastUsedAt: prior.lastUsedAt,
          prior,
        });
      }
    }
    const changed = changes.filter((change) => !isZero(change.delta));
    const correctionRows = changed.filter((change) => counterFields.some((field) => change.delta[field] < 0)).length;
    const dayDelta = zeroCounters();
    for (const change of changed) add(dayDelta, change.delta);
    const priorDay = await ctx.db.query("profileDailyTotals").withIndex("by_profileId_and_day", (q) =>
      q.eq("profileId", collector.profileId).eq("day", args.day),
    ).unique();
    const dayWasActive = (priorDay?.totalTokens ?? 0) > 0;

    for (const change of changes) {
      const priorDaily = await ctx.db.query("dailyUsage").withIndex("by_profileId_and_day_and_source_and_provider_and_model", (q) =>
        q.eq("profileId", collector.profileId).eq("day", args.day).eq("source", args.source).eq("provider", change.provider).eq("model", change.model),
      ).unique();
      if (!isZero(change.delta)) {
        if (!priorDaily && counterFields.some((field) => change.delta[field] < 0)) throw new ConvexError("PROJECTION_UNDERFLOW");
        const dailyUpdate = {
          inputTokens: nextValue(priorDaily?.inputTokens ?? 0, change.delta.inputTokens),
          outputTokens: nextValue(priorDaily?.outputTokens ?? 0, change.delta.outputTokens),
          cacheReadTokens: nextValue(priorDaily?.cacheReadTokens ?? 0, change.delta.cacheReadTokens),
          cacheWriteTokens: nextValue(priorDaily?.cacheWriteTokens ?? 0, change.delta.cacheWriteTokens),
          reasoningTokens: nextValue(priorDaily?.reasoningTokens ?? 0, change.delta.reasoningTokens),
          unclassifiedTokens: nextValue(priorDaily?.unclassifiedTokens ?? 0, change.delta.unclassifiedTokens),
          totalTokens: nextValue(priorDaily?.totalTokens ?? 0, change.delta.totalTokens),
          costMicros: nextValue(priorDaily?.costMicros ?? 0, change.delta.costMicros),
          requests: nextValue(priorDaily?.requests ?? 0, change.delta.requests),
          errors: nextValue(priorDaily?.errors ?? 0, change.delta.errors),
          sessions: priorDaily?.sessions ?? 0,
          costBasis: mergeBasis(priorDaily?.costBasis, change.basis),
          updatedAt: args.now,
        };
        if (priorDaily) {
          if (dailyUpdate.totalTokens === 0 && dailyUpdate.costMicros === 0) await ctx.db.delete(priorDaily._id);
          else await ctx.db.patch(priorDaily._id, dailyUpdate);
        } else if (dailyUpdate.totalTokens > 0 || dailyUpdate.costMicros > 0) {
          await ctx.db.insert("dailyUsage", {
            workspaceId: collector.workspaceId,
            profileId: collector.profileId,
            day: args.day,
            source: args.source,
            provider: change.provider,
            model: change.model,
            ...dailyUpdate,
          });
        }

        const priorModel = await ctx.db.query("modelTotals").withIndex("by_profileId_and_provider_and_model", (q) =>
          q.eq("profileId", collector.profileId).eq("provider", change.provider).eq("model", change.model),
        ).unique();
        if (!priorModel && counterFields.some((field) => change.delta[field] < 0)) throw new ConvexError("PROJECTION_UNDERFLOW");
        const modelUpdate = {
          totalTokens: nextValue(priorModel?.totalTokens ?? 0, change.delta.totalTokens),
          inputTokens: nextValue(priorModel?.inputTokens ?? 0, change.delta.inputTokens),
          outputTokens: nextValue(priorModel?.outputTokens ?? 0, change.delta.outputTokens),
          cacheReadTokens: nextValue(priorModel?.cacheReadTokens ?? 0, change.delta.cacheReadTokens),
          cacheWriteTokens: nextValue(priorModel?.cacheWriteTokens ?? 0, change.delta.cacheWriteTokens),
          reasoningTokens: nextValue(priorModel?.reasoningTokens ?? 0, change.delta.reasoningTokens),
          unclassifiedTokens: nextValue(priorModel?.unclassifiedTokens ?? 0, change.delta.unclassifiedTokens),
          costMicros: nextValue(priorModel?.costMicros ?? 0, change.delta.costMicros),
          requests: nextValue(priorModel?.requests ?? 0, change.delta.requests),
          errors: nextValue(priorModel?.errors ?? 0, change.delta.errors),
          costBasis: mergeBasis(priorModel?.costBasis, change.basis),
          lastUsedAt: Math.max(priorModel?.lastUsedAt ?? 0, change.lastUsedAt),
        };
        if (priorModel) {
          if (modelUpdate.totalTokens === 0 && modelUpdate.costMicros === 0) await ctx.db.delete(priorModel._id);
          else await ctx.db.patch(priorModel._id, modelUpdate);
        } else if (modelUpdate.totalTokens > 0 || modelUpdate.costMicros > 0) {
          await ctx.db.insert("modelTotals", {
            workspaceId: collector.workspaceId,
            profileId: collector.profileId,
            provider: change.provider,
            model: change.model,
            ...modelUpdate,
          });
        }
      }

      if (isZero(change.current)) {
        if (change.prior) await ctx.db.delete(change.prior._id);
      } else {
        const snapshotValue = {
          ...change.current,
          costBasis: change.basis,
          pricingVersion: args.pricingVersion,
          contentHash: change.contentHash,
          revision: args.revision,
          seenRunId: args.runId,
          lastUsedAt: change.lastUsedAt,
          updatedAt: args.now,
        };
        if (change.prior) await ctx.db.patch(change.prior._id, snapshotValue);
        else await ctx.db.insert("collectorUsageSnapshots", {
          workspaceId: collector.workspaceId,
          profileId: collector.profileId,
          collectorId: collector._id,
          source: args.source,
          day: args.day,
          provider: change.provider,
          model: change.model,
          ...snapshotValue,
        });
      }
    }

    // Pure replays/adoption write snapshot receipts, not every shared rollup.
    if (changed.length) {
    const dayUpdate = {
      totalTokens: nextValue(priorDay?.totalTokens ?? 0, dayDelta.totalTokens),
      outputTokens: nextValue(priorDay?.outputTokens ?? 0, dayDelta.outputTokens),
      unclassifiedTokens: nextValue(priorDay?.unclassifiedTokens ?? 0, dayDelta.unclassifiedTokens),
      costMicros: nextValue(priorDay?.costMicros ?? 0, dayDelta.costMicros),
      sessions: priorDay?.sessions ?? 0,
      requests: nextValue(priorDay?.requests ?? 0, dayDelta.requests),
      errors: nextValue(priorDay?.errors ?? 0, dayDelta.errors),
      costBasis: mergeBasis(priorDay?.costBasis, changes[0]?.basis),
      updatedAt: args.now,
    };
    if (priorDay) {
      if (dayUpdate.totalTokens === 0 && dayUpdate.costMicros === 0) await ctx.db.delete(priorDay._id);
      else await ctx.db.patch(priorDay._id, dayUpdate);
    } else if (dayUpdate.totalTokens > 0 || dayUpdate.costMicros > 0) {
      await ctx.db.insert("profileDailyTotals", { workspaceId: collector.workspaceId, profileId: collector.profileId, day: args.day, ...dayUpdate });
    }
    const dayIsActive = dayUpdate.totalTokens > 0;

    const sourceDimension = await ctx.db.query("dailyDimensions").withIndex("by_profileId_and_dimension_and_day_and_key", (q) =>
      q.eq("profileId", collector.profileId).eq("dimension", "source").eq("day", args.day).eq("key", args.source),
    ).unique();
    const sourceUpdate = {
      outputTokens: nextValue(sourceDimension?.outputTokens ?? 0, dayDelta.outputTokens),
      unclassifiedTokens: nextValue(sourceDimension?.unclassifiedTokens ?? 0, dayDelta.unclassifiedTokens),
      totalTokens: nextValue(sourceDimension?.totalTokens ?? 0, dayDelta.totalTokens),
      costMicros: nextValue(sourceDimension?.costMicros ?? 0, dayDelta.costMicros),
      sessions: sourceDimension?.sessions ?? 0,
      costBasis: mergeBasis(sourceDimension?.costBasis, changes[0]?.basis) ?? "unknown",
      updatedAt: args.now,
    };
    if (sourceDimension) {
      if (sourceUpdate.totalTokens === 0 && sourceUpdate.costMicros === 0) await ctx.db.delete(sourceDimension._id);
      else await ctx.db.patch(sourceDimension._id, sourceUpdate);
    } else if (sourceUpdate.totalTokens > 0 || sourceUpdate.costMicros > 0) {
      await ctx.db.insert("dailyDimensions", {
        workspaceId: collector.workspaceId,
        profileId: collector.profileId,
        day: args.day,
        dimension: "source",
        key: args.source,
        origin: "first-party",
        ...sourceUpdate,
      });
    }

    const deviceLabel = await ensureProfileDevice(ctx, collector, args.now);
    const deviceDimension = await ctx.db.query("dailyDimensions").withIndex("by_profileId_and_dimension_and_day_and_key", (q) =>
      q.eq("profileId", collector.profileId).eq("dimension", "device").eq("day", args.day).eq("key", deviceLabel),
    ).unique();
    const deviceUpdate = {
      outputTokens: nextValue(deviceDimension?.outputTokens ?? 0, dayDelta.outputTokens),
      unclassifiedTokens: nextValue(deviceDimension?.unclassifiedTokens ?? 0, dayDelta.unclassifiedTokens),
      totalTokens: nextValue(deviceDimension?.totalTokens ?? 0, dayDelta.totalTokens),
      costMicros: nextValue(deviceDimension?.costMicros ?? 0, dayDelta.costMicros),
      sessions: deviceDimension?.sessions ?? 0,
      costBasis: mergeBasis(deviceDimension?.costBasis, changes[0]?.basis) ?? "unknown",
      updatedAt: args.now,
    };
    if (deviceDimension) {
      if (deviceUpdate.totalTokens === 0 && deviceUpdate.costMicros === 0) await ctx.db.delete(deviceDimension._id);
      else await ctx.db.patch(deviceDimension._id, deviceUpdate);
    } else if (deviceUpdate.totalTokens > 0 || deviceUpdate.costMicros > 0) {
      await ctx.db.insert("dailyDimensions", {
        workspaceId: collector.workspaceId,
        profileId: collector.profileId,
        day: args.day,
        dimension: "device",
        key: deviceLabel,
        keyHash: collector.installationIdHash ?? String(collector._id),
        origin: `collector:${collector._id}`,
        ...deviceUpdate,
      });
    }

    if (!isZero(dayDelta)) {
      const stats = await ctx.db.query("profileStats").withIndex("by_profileId", (q) => q.eq("profileId", collector.profileId)).unique();
      if (!stats) throw new ConvexError("PROFILE_STATS_NOT_FOUND");
      await ctx.db.patch(stats._id, {
        totalTokens: nextValue(stats.totalTokens, dayDelta.totalTokens),
        totalCostMicros: nextValue(stats.totalCostMicros, dayDelta.costMicros),
        inputTokens: nextValue(stats.inputTokens, dayDelta.inputTokens),
        outputTokens: nextValue(stats.outputTokens, dayDelta.outputTokens),
        cacheReadTokens: nextValue(stats.cacheReadTokens, dayDelta.cacheReadTokens),
        cacheWriteTokens: nextValue(stats.cacheWriteTokens ?? 0, dayDelta.cacheWriteTokens),
        reasoningTokens: nextValue(stats.reasoningTokens, dayDelta.reasoningTokens),
        unclassifiedTokens: nextValue(stats.unclassifiedTokens ?? 0, dayDelta.unclassifiedTokens),
        activeDays: nextValue(stats.activeDays, Number(dayIsActive) - Number(dayWasActive)),
        sources: [...new Set([...(stats.sources ?? []), args.source])].sort(),
        lastSyncAt: args.now,
        syncStatus: "healthy",
        pricingVersion: args.pricingVersion,
        updatedAt: args.now,
      });
      await updateNetwork(ctx, collector, dayDelta, 0, args.day, args.now);
    }
    }

    await ctx.db.insert("snapshotReceipts", {
      collectorId: collector._id,
      partitionId: args.partitionId,
      payloadHash: args.payloadHash,
      revision: args.revision,
      changedRows: changed.length,
      correctionRows,
      createdAt: args.now,
    });
    const cleanupNeeded = args.complete && run.inventoryComplete && run.inventoryErrors === 0 && !run.inventoryTruncated;
    const lastChunk = chunked && !cleaning && args.chunkIndex! + 1 === args.chunkCount;
    await ctx.db.patch(run._id, {
      acceptedPartitions: run.acceptedPartitions + (cleaning ? 0 : 1),
      pendingCleanups: (run.pendingCleanups ?? 0) + (chunked && !cleaning && args.chunkIndex === 0 ? 1 : 0) - ((cleaning && cleanupPage?.isDone) || (lastChunk && !cleanupNeeded) ? 1 : 0),
      changedRows: run.changedRows + changed.length,
      correctionRows: run.correctionRows + correctionRows,
      updatedAt: args.now,
    });
    if (group) {
      if (cleaning) {
        if (cleanupPage!.isDone) await ctx.db.patch(group._id, { done: true, updatedAt: args.now });
        else await ctx.scheduler.runAfter(0, internal.snapshots.commitPartition, { ...args, cleanupCursor: cleanupPage!.continueCursor, partitionId: `${args.runId}:cleanup:${group._id}:${cleanupPage!.continueCursor}`, now: args.now });
      } else {
        await ctx.db.patch(group._id, { nextChunk: args.chunkIndex! + 1, done: lastChunk && !cleanupNeeded, updatedAt: args.now });
        if (lastChunk && cleanupNeeded) {
          await ctx.scheduler.runAfter(0, internal.snapshots.commitPartition, { ...args, rows: [], cleanupCursor: null, partitionId: `${args.runId}:cleanup:${group._id}:start`, payloadHash: "internal-cleanup", now: args.now });
        }
      }
    }
    return { replay: false, changedRows: changed.length, correctionRows };
  },
});

async function refreshProfileSummary(ctx: MutationCtx, profileId: Doc<"profiles">["_id"], now: number) {
    const stats = await ctx.db.query("profileStats").withIndex("by_profileId", q => q.eq("profileId", profileId)).unique();
    const profile = await ctx.db.get(profileId);
    if (!stats || !profile) return;
    const activityRows = await ctx.db.query("profileDailyTotals").withIndex("by_profileId_and_day", (q) =>
      q.eq("profileId", profileId),
    ).order("desc").take(4000);
    const activeRows = activityRows.filter((row) => row.totalTokens > 0);
    const days = activeRows.map((row) => row.day);
    const streaks = streakMetrics(days, now);
    const peak = [...activeRows].sort((left, right) => right.costMicros - left.costMicros || left.day.localeCompare(right.day))[0];
    const topByCost = await ctx.db.query("modelTotals").withIndex("by_profileId_and_costMicros", (q) =>
      q.eq("profileId", profileId),
    ).order("desc").first();
    const topModel = (topByCost?.costMicros ?? 0) > 0
      ? topByCost
      : await ctx.db.query("modelTotals").withIndex("by_profileId_and_totalTokens", (q) => q.eq("profileId", profileId)).order("desc").first();
    const nextStats = {
      activeDays: activeRows.length,
      currentStreakDays: streaks.current,
      longestStreakDays: streaks.longest,
      firstDay: [...days].sort()[0],
      lastDay: [...days].sort().at(-1),
      peakDay: peak?.day,
      peakDayCostMicros: peak?.costMicros,
      avgCostPerActiveDayMicros: Math.round(stats.totalCostMicros / Math.max(1, activeRows.length)),
      topModel: topModel?.model ?? "unknown",
      topModelProvider: topModel?.provider,
      topModelMetric: ((topByCost?.costMicros ?? 0) > 0 ? "spend" : "tokens") as "spend" | "tokens",
      syncStatus: "healthy" as const,
      syncErrorCode: undefined,
      updatedAt: now,
    };
    await ctx.db.patch(stats._id, nextStats);
    const thirtyCutoff = dayFromTimestamp(now - 29 * DAY_MS);
    const sevenCutoff = dayFromTimestamp(now - 6 * DAY_MS);
    const recentDays = activityRows.filter((row) => row.day >= thirtyCutoff);
    const periodScores = [
      { period: "all" as const, tokens: stats.totalTokens, spend: stats.totalCostMicros },
      { period: "30d" as const, tokens: recentDays.reduce((sum, row) => sum + row.totalTokens, 0), spend: recentDays.reduce((sum, row) => sum + row.costMicros, 0) },
      { period: "7d" as const, tokens: recentDays.filter((row) => row.day >= sevenCutoff).reduce((sum, row) => sum + row.totalTokens, 0), spend: recentDays.filter((row) => row.day >= sevenCutoff).reduce((sum, row) => sum + row.costMicros, 0) },
    ];
    for (const score of periodScores) {
      for (const metric of ["tokens", "spend"] as const) {
        const prior = await ctx.db.query("leaderboardEntries").withIndex("by_profileId_and_period_and_metric", (q) =>
          q.eq("profileId", profileId).eq("period", score.period).eq("metric", metric),
        ).unique();
        const update = {
          handle: profile.handle,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          verification: profile.verification,
          score: metric === "tokens" ? score.tokens : score.spend,
          totalTokens: stats.totalTokens,
          totalCostMicros: stats.totalCostMicros,
          costBasis: stats.costBasis,
          sessions: stats.sessions,
          activeDays: nextStats.activeDays,
          lastEventAt: stats.lastEventAt,
          isPublic: profile.isPublic,
          updatedAt: now,
        };
        if (prior) await ctx.db.patch(prior._id, update);
        else await ctx.db.insert("leaderboardEntries", { workspaceId: profile.workspaceId, profileId: profileId, period: score.period, metric, ...update });
      }
    }
    await ctx.db.patch(stats._id, { summaryScheduledAt: undefined });
}

export const refreshSummary = internalMutation({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, args) => { await refreshProfileSummary(ctx, args.profileId, Date.now()); },
});

export const completeRun = internalMutation({
  args: {
    keyHash: v.string(),
    installationIdHash: v.optional(v.string()),
    runId: v.string(),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const collector = await collectorForKey(ctx, args.keyHash, args.installationIdHash);
    const run = await ctx.db.query("snapshotRuns").withIndex("by_collectorId_and_runId", (q) =>
      q.eq("collectorId", collector._id).eq("runId", args.runId),
    ).unique();
    if (!run) throw new ConvexError("SNAPSHOT_RUN_EXPIRED");
    if (run.status === "complete") return { replay: true, changedRows: run.changedRows, correctionRows: run.correctionRows };
    if (run.status === "failed") throw new ConvexError("SNAPSHOT_RUN_EXPIRED");
    await enforceCollectorRateLimit(ctx, String(collector._id));
    if (run.acceptedPartitions !== run.partitionCount || (run.pendingCleanups ?? 0) > 0) throw new ConvexError("SNAPSHOT_RUN_INCOMPLETE");
    const stats = await ctx.db.query("profileStats").withIndex("by_profileId", (q) => q.eq("profileId", collector.profileId)).unique();
    const profile = await ctx.db.get(collector.profileId);
    if (!stats || !profile) throw new ConvexError("PROFILE_NOT_FOUND");
    const workspace = await ctx.db.get(collector.workspaceId);
    if (workspace?.workosOrganizationId || stats.deviceCount >= 100) {
      if (stats.summaryScheduledAt === undefined) {
        await ctx.db.patch(stats._id, { summaryScheduledAt: args.now });
        await ctx.scheduler.runAfter(5_000, internal.snapshots.refreshSummary, { profileId: collector.profileId });
      }
    } else {
      await refreshProfileSummary(ctx, collector.profileId, args.now);
    }
    await ctx.db.patch(stats._id, { lastSyncAt: args.now, sessionCoverage: run.mode === "full" && run.inventoryComplete ? "complete" : "partial" });
    const coverageStatus = run.mode === "full" && run.inventoryComplete && !run.inventoryTruncated && run.inventoryErrors === 0
      ? "complete" as const
      : "partial" as const;
    await ctx.db.patch(run._id, { status: "complete", completedAt: args.now, updatedAt: args.now });
    await ctx.db.patch(collector._id, {
      lastSeenAt: args.now,
      lastSuccessAt: args.now,
      lastSyncRunId: args.runId,
      lastSyncPhase: "complete",
      lastFullSyncAt: run.mode === "full" || run.mode === "archives" ? args.now : collector.lastFullSyncAt,
      coverageStatus,
      coverageStartDay: run.coverageStartDay,
      coverageEndDay: run.coverageEndDay,
      inventoryComplete: run.inventoryComplete,
      inventoryErrors: run.inventoryErrors,
      inventoryTruncated: run.inventoryTruncated,
      sourceCount: run.sourceCount,
      unresolvedCorrections: 0,
      snapshotBaselineEstablishedAt: collector.snapshotBaselineEstablishedAt ?? args.now,
      snapshotBaselineMode: collector.snapshotBaselineMode ?? (run.baselineMode === "adopt-current" ? "legacy_adopted" : "native"),
    });
    return { replay: false, changedRows: run.changedRows, correctionRows: run.correctionRows, coverageStatus };
  },
});

export const failRun = internalMutation({
  args: { keyHash: v.string(), runId: v.string(), failureCode: v.string(), now: v.number() },
  handler: async (ctx, args) => {
    const collector = await collectorForKey(ctx, args.keyHash);
    await enforceCollectorRateLimit(ctx, String(collector._id));
    const run = await ctx.db.query("snapshotRuns").withIndex("by_collectorId_and_runId", (q) =>
      q.eq("collectorId", collector._id).eq("runId", args.runId),
    ).unique();
    if (!run || run.status === "complete") return { recorded: false };
    await ctx.db.patch(run._id, { status: "failed", failureCode: args.failureCode.slice(0, 80), updatedAt: args.now });
    await ctx.db.patch(collector._id, {
      lastFailureAt: args.now,
      lastFailureCode: args.failureCode.slice(0, 80),
      lastSyncPhase: "failed",
    });
    return { recorded: true };
  },
});

export const revokeSelf = internalMutation({
  args: { keyHash: v.string(), installationIdHash: v.optional(v.string()), now: v.number() },
  handler: async (ctx, args) => {
    const collector = await collectorForKey(ctx, args.keyHash, args.installationIdHash);
    await enforceCollectorRateLimit(ctx, String(collector._id));
    await ctx.db.patch(collector._id, {
      revokedAt: args.now,
      lastSeenAt: args.now,
      lastSyncPhase: "failed",
      lastFailureCode: "collector_revoked",
    });
    return { revoked: true };
  },
});
