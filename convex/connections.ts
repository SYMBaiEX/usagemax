import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import {
  accessReferenceValidator,
  audit,
  requireWorkspaceAccessForReference,
} from "./account";
import { requireEnterprise } from "./workspaces";
import { productPolicy } from "./productPolicy";
import { writeLedgerEntry } from "./finance";
import { nextDay } from "./providerMath";
import { isValidHistoricalDay } from "./lib";

export const provider = v.union(
  v.literal("anthropic"),
  v.literal("cursor"),
  v.literal("github"),
);
export const authorize = internalQuery({
  args: { access: accessReferenceValidator },
  handler: async (ctx, args) => {
    const access = await requireWorkspaceAccessForReference(
      ctx,
      args.access,
      "integrations:manage",
    );
    if (!productPolicy(access.workspace.plan).enterprise)
      throw new ConvexError("ENTERPRISE_REQUIRED");
    return { workspaceId: access.workspace._id, userId: access.user._id };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const { workspace } = await requireEnterprise(ctx, "integrations:manage");
    const rows = await ctx.db
      .query("providerConnections")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspace._id))
      .take(51);
    return rows.map((row) => ({
      id: row._id,
      provider: row.provider,
      name: row.name,
      accountId: row.accountId,
      state: row.state,
      lastSuccessAt: row.lastSuccessAt,
      lastError: row.lastError,
      coverageStartDay: row.coverageStartDay,
      coverageEndDay: row.coverageEndDay,
      coverageNote: row.coverageNote,
      reportedSeats: row.reportedSeats,
    }));
  },
});

export const store = internalMutation({
  args: {
    access: accessReferenceValidator,
    provider,
    name: v.string(),
    accountId: v.string(),
    startDay: v.string(),
    secretCiphertext: v.string(),
    secretIv: v.string(),
    keyVersion: v.string(),
  },
  handler: async (ctx, args) => {
    const { workspace, user } = await requireWorkspaceAccessForReference(
      ctx,
      args.access,
      "integrations:manage",
    );
    if (!productPolicy(workspace.plan).enterprise)
      throw new ConvexError("ENTERPRISE_REQUIRED");
    if (
      !isValidHistoricalDay(args.startDay) ||
      args.startDay > new Date().toISOString().slice(0, 10)
    )
      throw new ConvexError("INVALID_START_DAY");
    if (
      !args.accountId.trim() ||
      args.accountId.length > 100 ||
      !args.name.trim() ||
      args.name.length > 80
    )
      throw new ConvexError("INVALID_CONNECTION");
    const rows = await ctx.db
      .query("providerConnections")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspace._id))
      .take(51);
    const existing = rows.find(
      (row) =>
        row.provider === args.provider && row.accountId === args.accountId,
    );
    if (
      !existing &&
      args.provider !== "github" &&
      rows.some((row) => row.provider === args.provider)
    )
      throw new ConvexError("ONE_ACCOUNT_PER_PROVIDER_UNTIL_IDENTITY_VERIFIED");
    if (!existing && rows.length >= 50)
      throw new ConvexError("CONNECTION_LIMIT");
    const values = {
      provider: args.provider,
      name: args.name.trim(),
      accountId: args.accountId,
      secretCiphertext: args.secretCiphertext,
      secretIv: args.secretIv,
      keyVersion: args.keyVersion,
      state: "connected" as const,
      syncDay: args.startDay,
      syncPage: undefined,
      syncAmountMicros: undefined,
      syncSeen: undefined,
      syncExpected: undefined,
      nextSyncAt: Date.now(),
      consecutiveFailures: 0,
      syncLeaseId: undefined,
      syncLeaseUntil: undefined,
      lastError: undefined,
      coverageNote:
        args.provider === "github"
          ? "Copilot seat inventory only; tokens and billed spend are not supplied by this connection."
          : args.provider === "cursor"
            ? "Chargeable Cursor usage only, including Cursor token fees. Included-plan usage is not counted as cash spend. Subscriptions require invoice records."
            : "Anthropic Console reported cost. Not Claude subscriptions, Enterprise Analytics, Bedrock or priority-tier invoice adjustments.",
    };
    const id = existing
      ? (await ctx.db.patch(existing._id, values), existing._id)
      : await ctx.db.insert("providerConnections", {
          workspaceId: workspace._id,
          ...values,
          createdBy: user._id,
          createdAt: Date.now(),
        });
    await audit(
      ctx,
      workspace._id,
      user._id,
      "connection.saved",
      "connection",
      id,
      "Saved encrypted server-side provider credentials",
    );
    await ctx.scheduler.runAfter(0, internal.connections.dispatch, {});
    return id;
  },
});

export const disconnect = mutation({
  args: { id: v.id("providerConnections") },
  handler: async (ctx, args) => {
    const { workspace, user } = await requireEnterprise(
      ctx,
      "integrations:manage",
    );
    const row = await ctx.db.get(args.id);
    if (row?.workspaceId !== workspace._id)
      throw new ConvexError("CONNECTION_NOT_FOUND");
    await ctx.db.patch(row._id, {
      state: "paused",
      secretCiphertext: "",
      secretIv: "",
      syncLeaseId: undefined,
      syncLeaseUntil: undefined,
    });
    await audit(
      ctx,
      workspace._id,
      user._id,
      "connection.disconnected",
      "connection",
      row._id,
      "Removed stored credential; retained financial evidence",
    );
  },
});

export const dispatch = internalMutation({
  args: {},
  handler: async (ctx) => {
    const active = await ctx.db.query("providerConnections")
      .withIndex("by_state_and_syncLeaseUntil", q => q.eq("state", "connected").gt("syncLeaseUntil", Date.now())).take(20);
    const capacity = Math.min(10, 20 - active.length);
    if (capacity === 0) return;
    const rows = await ctx.db
      .query("providerConnections")
      .withIndex("by_state_and_nextSyncAt", (q) =>
        q.eq("state", "connected").lte("nextSyncAt", Date.now()),
      )
      // Bounded dispatch waves; leases protect overlapping cron/continuations.
      .take(capacity);
    for (const row of rows) {
      const workspace = await ctx.db.get(row.workspaceId);
      if (
        !workspace ||
        workspace.accessDisabledAt ||
        !productPolicy(workspace.plan).enterprise
      ) {
        await ctx.db.patch(row._id, { state: "paused" });
        continue;
      }
      if ((row.syncLeaseUntil ?? 0) > Date.now()) continue;
      const leaseId = crypto.randomUUID();
      await ctx.db.patch(row._id, {
        syncLeaseId: leaseId,
        syncLeaseUntil: Date.now() + 120_000,
        nextSyncAt: Date.now() + 120_000,
        lastAttemptAt: Date.now(),
      });
      await ctx.scheduler.runAfter(0, internal.providerActions.sync, {
        id: row._id,
        leaseId,
      });
    }
  },
});

export const leased = internalQuery({
  args: { id: v.id("providerConnections"), leaseId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    return row?.state === "connected" && row.syncLeaseId === args.leaseId
      ? row
      : null;
  },
});

export const finish = internalMutation({
  args: {
    id: v.id("providerConnections"),
    leaseId: v.string(),
    day: v.string(),
    costMicros: v.optional(v.number()),
    page: v.optional(v.number()),
    seen: v.optional(v.number()),
    expected: v.optional(v.number()),
    hasMore: v.optional(v.boolean()),
    seats: v.optional(v.number()),
    error: v.optional(v.string()),
    retryable: v.optional(v.boolean()),
    retryAfterMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row || row.state !== "connected" || row.syncLeaseId !== args.leaseId)
      return;
    const workspace = await ctx.db.get(row.workspaceId);
    if (
      !workspace ||
      workspace.accessDisabledAt ||
      !productPolicy(workspace.plan).enterprise
    )
      return;
    if (args.error) {
      const attempts = (row.consecutiveFailures ?? 0) + 1;
      const retry = args.retryable === true && attempts <= 8 && (args.retryAfterMs ?? 0) <= 86_400_000;
      const backoff = Math.max(args.retryAfterMs ?? 0, Math.min(3_600_000, 30_000 * 2 ** Math.min(attempts - 1, 7)));
      await ctx.db.patch(row._id, {
        state: retry ? "connected" : "error",
        consecutiveFailures: attempts,
        nextSyncAt: Date.now() + backoff + Math.floor(Math.random() * 5_000),
        lastError: args.error.slice(0, 100),
        syncLeaseId: undefined,
        syncLeaseUntil: undefined,
      });
      return;
    }
    if (args.page !== undefined && args.page !== (row.syncPage ?? 1)) return;
    if (args.hasMore) {
      await ctx.db.patch(row._id, {
        consecutiveFailures: 0,
        lastError: undefined,
        syncPage: (args.page ?? 1) + 1,
        syncAmountMicros: args.costMicros,
        syncSeen: args.seen,
        syncExpected: args.expected,
        syncLeaseUntil: Date.now() + 120_000,
        nextSyncAt: Date.now() + 120_000,
      });
      await ctx.scheduler.runAfter(1000, internal.providerActions.sync, {
        id: row._id,
        leaseId: args.leaseId,
      });
      return;
    }
    if (args.costMicros !== undefined)
      await writeLedgerEntry(
        ctx,
        row.workspaceId,
        {
          externalKey: `provider:${row._id}:${args.day}`,
          provider: row.provider,
          account: row.accountId,
          day: args.day,
          currency: "USD",
          amountMicros: args.costMicros,
          kind: "usage",
          basis: "reported",
          note: row.coverageNote,
        },
        { source: "provider", connectionId: row._id },
      );
    const today = new Date().toISOString().slice(0, 10);
    const caughtUp = args.day >= today || row.provider === "github";
    await ctx.db.patch(row._id, {
      syncDay: caughtUp ? nextDay(today, -2) : nextDay(args.day),
      syncPage: undefined,
      syncAmountMicros: undefined,
      syncSeen: undefined,
      syncExpected: undefined,
      nextSyncAt: Date.now() + (caughtUp ? 15 * 60_000 : 60_000),
      lastSuccessAt: Date.now(),
      lastError: undefined,
      consecutiveFailures: 0,
      reportedSeats: args.seats,
      coverageStartDay:
        !row.coverageStartDay || args.day < row.coverageStartDay
          ? args.day
          : row.coverageStartDay,
      coverageEndDay:
        !row.coverageEndDay || args.day > row.coverageEndDay
          ? args.day
          : row.coverageEndDay,
      syncLeaseId: undefined,
      syncLeaseUntil: undefined,
    });
  },
});
