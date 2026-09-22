import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import {
  requireWorkspaceMembership,
  requireWorkspaceAccess,
  audit,
} from "./account";
import { cleanText, isValidHistoricalDay } from "./lib";
import { productPolicy } from "./productPolicy";

export const preferences = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireWorkspaceMembership(ctx);
    const stored = await ctx.db
      .query("preferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    return (
      stored ?? {
        timezone: "UTC",
        weekStartsOn: "monday" as const,
        defaultRange: "30d" as const,
        notificationBudgets: true,
        notificationCoverage: true,
      }
    );
  },
});

export const savePreferences = mutation({
  args: {
    timezone: v.string(),
    weekStartsOn: v.union(v.literal("monday"), v.literal("sunday")),
    defaultRange: v.union(
      v.literal("7d"),
      v.literal("30d"),
      v.literal("90d"),
      v.literal("all"),
    ),
    notificationBudgets: v.boolean(),
    notificationCoverage: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireWorkspaceMembership(ctx);
    if (args.timezone.length > 80) throw new ConvexError("INVALID_TIMEZONE");
    try {
      new Intl.DateTimeFormat("en", { timeZone: args.timezone });
    } catch {
      throw new ConvexError("INVALID_TIMEZONE");
    }
    const stored = await ctx.db
      .query("preferences")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (stored)
      await ctx.db.patch(stored._id, { ...args, updatedAt: Date.now() });
    else
      await ctx.db.insert("preferences", {
        userId: user._id,
        ...args,
        updatedAt: Date.now(),
      });
  },
});

export const usage = query({
  args: {
    startDay: v.string(),
    endDay: v.string(),
    model: v.optional(v.string()),
    source: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { profile } = await requireWorkspaceAccess(ctx, "finance:read");
    if (
      args.startDay > args.endDay ||
      !/^\d{4}-\d{2}-\d{2}$/.test(args.startDay) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(args.endDay)
    )
      throw new ConvexError("INVALID_RANGE");
    if (args.model && args.source)
      return await ctx.db
        .query("dailyUsage")
        .withIndex("by_profileId_and_source_and_model_and_day", (q) =>
          q
            .eq("profileId", profile._id)
            .eq("source", args.source!)
            .eq("model", args.model!)
            .gte("day", args.startDay)
            .lte("day", args.endDay),
        )
        .order("desc")
        .paginate(args.paginationOpts);
    if (args.model)
      return await ctx.db
        .query("dailyUsage")
        .withIndex("by_profileId_and_model_and_day", (q) =>
          q
            .eq("profileId", profile._id)
            .eq("model", args.model!)
            .gte("day", args.startDay)
            .lte("day", args.endDay),
        )
        .order("desc")
        .paginate(args.paginationOpts);
    if (args.source)
      return await ctx.db
        .query("dailyUsage")
        .withIndex("by_profileId_and_source_and_day", (q) =>
          q
            .eq("profileId", profile._id)
            .eq("source", args.source!)
            .gte("day", args.startDay)
            .lte("day", args.endDay),
        )
        .order("desc")
        .paginate(args.paginationOpts);
    return await ctx.db
      .query("dailyUsage")
      .withIndex("by_profileId_and_day", (q) =>
        q
          .eq("profileId", profile._id)
          .gte("day", args.startDay)
          .lte("day", args.endDay),
      )
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const summary = query({
  args: {},
  handler: async (ctx) => {
    const { profile, workspace } = await requireWorkspaceAccess(
      ctx,
      "finance:read",
    );
    const stats = await ctx.db
      .query("profileStats")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .unique();
    const models = await ctx.db
      .query("modelTotals")
      .withIndex("by_profileId_and_totalTokens", (q) =>
        q.eq("profileId", profile._id),
      )
      .order("desc")
      .take(101);
    return {
      stats,
      models: models.slice(0, 100),
      moreModels: models.length > 100,
      personal: !workspace.workosOrganizationId,
    };
  },
});

export const savedViews = query({
  args: {},
  handler: async (ctx) => {
    const { workspace, user } = await requireWorkspaceMembership(ctx);
    return await ctx.db
      .query("savedViews")
      .withIndex("by_workspaceId_and_userId", (q) =>
        q.eq("workspaceId", workspace._id).eq("userId", user._id),
      )
      .take(30);
  },
});

export const saveView = mutation({
  args: {
    name: v.string(),
    startDay: v.string(),
    endDay: v.string(),
    model: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { workspace, user } = await requireWorkspaceMembership(ctx);
    if (
      !isValidHistoricalDay(args.startDay) ||
      !isValidHistoricalDay(args.endDay) ||
      args.startDay > args.endDay
    )
      throw new ConvexError("INVALID_RANGE");
    if ((args.model?.length ?? 0) > 100 || (args.source?.length ?? 0) > 80)
      throw new ConvexError("INVALID_FILTER");
    const name = cleanText(args.name, "", 60);
    if (!name) throw new ConvexError("NAME_REQUIRED");
    const rows = await ctx.db
      .query("savedViews")
      .withIndex("by_workspaceId_and_userId", (q) =>
        q.eq("workspaceId", workspace._id).eq("userId", user._id),
      )
      .take(31);
    if (rows.length >= productPolicy(workspace.plan).savedViews)
      throw new ConvexError("SAVED_VIEW_LIMIT");
    return await ctx.db.insert("savedViews", {
      workspaceId: workspace._id,
      userId: user._id,
      ...args,
      name,
      createdAt: Date.now(),
    });
  },
});

export const removeView = mutation({
  args: { id: v.id("savedViews") },
  handler: async (ctx, args) => {
    const { workspace, user } = await requireWorkspaceMembership(ctx);
    const row = await ctx.db.get(args.id);
    if (row?.workspaceId !== workspace._id || row.userId !== user._id)
      throw new ConvexError("VIEW_NOT_FOUND");
    await ctx.db.delete(row._id);
  },
});

export const notifications = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const { workspace, user } = await requireWorkspaceMembership(ctx);
    return await ctx.db
      .query("notifications")
      .withIndex("by_workspaceId_and_userId_and_createdAt", (q) =>
        q.eq("workspaceId", workspace._id).eq("userId", user._id),
      )
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const readNotification = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, args) => {
    const { workspace, user } = await requireWorkspaceMembership(ctx);
    const row = await ctx.db.get(args.id);
    if (row?.workspaceId !== workspace._id || row.userId !== user._id)
      throw new ConvexError("NOTIFICATION_NOT_FOUND");
    if (!row.readAt) await ctx.db.patch(row._id, { readAt: Date.now() });
  },
});

export const beginExport = mutation({
  args: {
    dataset: v.union(
      v.literal("daily"),
      v.literal("models"),
      v.literal("ledger"),
      v.literal("audit"),
      v.literal("telemetry"),
      v.literal("agents"),
      v.literal("outcomes"),
    ),
  },
  handler: async (ctx, args) => {
    const { workspace, user } = await requireWorkspaceAccess(
      ctx,
      "data:export",
    );
    await audit(
      ctx,
      workspace._id,
      user._id,
      "export.started",
      "workspace",
      workspace._id,
      `Started paginated export: ${cleanText(args.dataset, "data", 40)}`,
    );
  },
});

export const exportPage = query({
  args: {
    expectedWorkspaceId: v.optional(v.id("workspaces")),
    dataset: v.union(
      v.literal("daily"),
      v.literal("models"),
      v.literal("ledger"),
      v.literal("audit"),
      v.literal("telemetry"),
      v.literal("agents"),
      v.literal("outcomes"),
    ),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { profile, workspace } = await requireWorkspaceAccess(
      ctx,
      "data:export",
    );
    if (args.dataset === "audit") {
      if (
        args.expectedWorkspaceId &&
        args.expectedWorkspaceId !== workspace._id
      )
        throw new ConvexError("EXPORT_WORKSPACE_CHANGED_RESTART");
      await requireWorkspaceAccess(ctx, "audit:read");
      return await ctx.db
        .query("auditEvents")
        .withIndex("by_workspaceId_and_createdAt", (q) =>
          q.eq("workspaceId", workspace._id),
        )
        .paginate(args.paginationOpts);
    }
    await requireWorkspaceAccess(ctx, "finance:read");
    if (args.expectedWorkspaceId && args.expectedWorkspaceId !== workspace._id)
      throw new ConvexError("EXPORT_WORKSPACE_CHANGED_RESTART");
    if (args.dataset === "ledger")
      return await ctx.db
        .query("financialEntries")
        .withIndex("by_workspaceId_and_day", (q) =>
          q.eq("workspaceId", workspace._id),
        )
        .paginate(args.paginationOpts);
    if (args.dataset === "models")
      return await ctx.db
        .query("modelTotals")
        .withIndex("by_profileId_and_totalTokens", (q) =>
          q.eq("profileId", profile._id),
        )
        .paginate(args.paginationOpts);
    if (args.dataset === "telemetry") {
      const result = await ctx.db
        .query("telemetryEvents")
        .withIndex("by_profileId_and_occurredAt", (q) =>
          q.eq("profileId", profile._id),
        )
        .order("desc")
        .paginate(args.paginationOpts);
      return {
        ...result,
        page: result.page.map((event) => ({
          eventKey: event.eventKey,
          logicalRequestId: event.logicalRequestId,
          sessionId: event.sessionId,
          agentExternalId: event.agentExternalId,
          parentAgentExternalId: event.parentAgentExternalId,
          agentName: event.agentName,
          eventType: event.eventType,
          source: event.source,
          provider: event.provider,
          requestedModel: event.requestedModel,
          model: event.model,
          inputTokens: event.inputTokens,
          outputTokens: event.outputTokens,
          cacheReadTokens: event.cacheReadTokens,
          cacheWriteTokens: event.cacheWriteTokens,
          reasoningTokens: event.reasoningTokens,
          totalTokens: event.totalTokens,
          costMicros: event.costMicros,
          costBasis: event.costBasis,
          pricingSource: event.pricingSource,
          pricingVersion: event.pricingVersion,
          serviceTier: event.serviceTier,
          region: event.region,
          currency: event.currency,
          projectId: event.projectId,
          costCenter: event.costCenter,
          accountingMode: event.accountingMode,
          latencyMs: event.latencyMs,
          timeToFirstTokenMs: event.timeToFirstTokenMs,
          status: event.status,
          state: event.state,
          task: event.task,
          traceId: event.traceId,
          spanId: event.spanId,
          occurredAt: event.occurredAt,
          receivedAt: event.receivedAt,
          schemaVersion: event.schemaVersion,
          completeness: event.completeness,
        })),
      };
    }
    if (args.dataset === "agents") {
      const result = await ctx.db
        .query("agentLiveStats")
        .withIndex("by_profileId_and_updatedAt", (q) =>
          q.eq("profileId", profile._id),
        )
        .order("desc")
        .paginate(args.paginationOpts);
      return {
        ...result,
        page: result.page.map((agent) => ({
          externalId: agent.externalId,
          parentExternalId: agent.parentExternalId,
          name: agent.name,
          model: agent.model,
          state: agent.state,
          task: agent.task,
          tokensPerSecond: agent.tokensPerSecond,
          totalTokens: agent.totalTokens,
          toolCalls: agent.toolCalls,
          errorCount: agent.errorCount,
          sessionStartedAt: agent.sessionStartedAt,
          updatedAt: agent.updatedAt,
          expiresAt: agent.expiresAt,
          traceId: agent.traceId,
        })),
      };
    }
    if (args.dataset === "outcomes") {
      const result = await ctx.db
        .query("outcomes")
        .withIndex("by_profileId_and_occurredAt", (q) =>
          q.eq("profileId", profile._id),
        )
        .order("desc")
        .paginate(args.paginationOpts);
      return {
        ...result,
        page: result.page.map((outcome) => ({
          eventKey: outcome.eventKey,
          logicalRequestId: outcome.logicalRequestId,
          outcome: outcome.outcome,
          occurredAt: outcome.occurredAt,
          createdAt: outcome.createdAt,
        })),
      };
    }
    return await ctx.db
      .query("dailyUsage")
      .withIndex("by_profileId_and_day", (q) => q.eq("profileId", profile._id))
      .paginate(args.paginationOpts);
  },
});
