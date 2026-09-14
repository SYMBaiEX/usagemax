import { ConvexError, v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DAY_MS, cleanText, isValidHistoricalDay, sha256 } from "./lib";

const importedDayValidator = v.object({
  day: v.string(),
  model: v.string(),
  outputTokens: v.number(),
  totalTokens: v.number(),
  costMicros: v.number(),
});

const importedModelValidator = v.object({
  model: v.string(),
  totalTokens: v.number(),
  outputTokens: v.number(),
  costMicros: v.number(),
  lastUsedAt: v.number(),
});

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function providerFor(model: string) {
  const value = model.toLowerCase();
  if (value.includes("claude")) return "anthropic";
  if (value.includes("gpt") || value.includes("codex")) return "openai";
  if (value.includes("gemini")) return "google";
  if (value.includes("muse")) return "openrouter";
  return "unknown";
}

function streaks(days: string[]) {
  const sorted = [...new Set(days)].sort();
  let longest = 0;
  let currentRun = 0;
  let previous = 0;
  for (const day of sorted) {
    const timestamp = Date.parse(`${day}T00:00:00.000Z`);
    currentRun = previous && timestamp - previous === DAY_MS ? currentRun + 1 : 1;
    longest = Math.max(longest, currentRun);
    previous = timestamp;
  }
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);
  const last = sorted.at(-1);
  return { longest, current: last === today || last === yesterday ? currentRun : 0 };
}

export const begin = internalMutation({
  args: {
    handle: v.string(),
    displayName: v.string(),
    avatarUrl: v.optional(v.string()),
    sourceUrl: v.string(),
    collectorKeyHash: v.string(),
    collectorKeyPrefix: v.string(),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const workspaceSlug = args.handle;
    let workspace = await ctx.db.query("workspaces").withIndex("by_slug", (q) => q.eq("slug", workspaceSlug)).unique();
    if (!workspace) {
      const id = await ctx.db.insert("workspaces", {
        slug: workspaceSlug,
        name: `${args.displayName}'s workspace`,
        plan: "free",
        isPublic: true,
        retentionDays: 30,
        createdAt: args.now,
      });
      workspace = await ctx.db.get(id);
    }
    if (!workspace) throw new ConvexError("WORKSPACE_CREATE_FAILED");

    let profile = await ctx.db.query("profiles").withIndex("by_handle", (q) => q.eq("handle", args.handle)).unique();
    if (!profile) {
      const id = await ctx.db.insert("profiles", {
        workspaceId: workspace._id,
        handle: args.handle,
        displayName: args.displayName,
        bio: "Building at the edge of human and agent throughput.",
        avatarUrl: args.avatarUrl,
        isPublic: true,
        isVerified: false,
        verification: "imported",
        sourceUrl: args.sourceUrl,
        importedAt: args.now,
        createdAt: args.now,
      });
      profile = await ctx.db.get(id);
    } else {
      await ctx.db.patch(profile._id, {
        displayName: args.displayName,
        avatarUrl: args.avatarUrl,
        sourceUrl: args.sourceUrl,
        importedAt: args.now,
      });
    }
    if (!profile) throw new ConvexError("PROFILE_CREATE_FAILED");

    const collector = await ctx.db.query("collectors").withIndex("by_keyHash", (q) => q.eq("keyHash", args.collectorKeyHash)).unique();
    if (!collector) {
      await ctx.db.insert("collectors", {
        workspaceId: workspace._id,
        profileId: profile._id,
        name: "UsageMax owner collector",
        keyHash: args.collectorKeyHash,
        keyPrefix: args.collectorKeyPrefix,
        scopes: ["telemetry:write", "outcomes:write"],
        createdAt: args.now,
      });
    }
    return { workspaceId: workspace._id, profileId: profile._id };
  },
});

export const applyDays = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    profileId: v.id("profiles"),
    rows: v.array(importedDayValidator),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      const source = "tokenmaxxing-import";
      const prior = await ctx.db
        .query("dailyUsage")
        .withIndex("by_profileId_and_day_and_source_and_model", (q) =>
          q.eq("profileId", args.profileId).eq("day", row.day).eq("source", source).eq("model", row.model),
        )
        .unique();
      const value = {
        workspaceId: args.workspaceId,
        profileId: args.profileId,
        day: row.day,
        source,
        provider: providerFor(row.model),
        model: row.model,
        inputTokens: Math.max(0, row.totalTokens - row.outputTokens),
        outputTokens: row.outputTokens,
        cacheReadTokens: 0,
        reasoningTokens: 0,
        totalTokens: row.totalTokens,
        costMicros: row.costMicros,
        sessions: 0,
        requests: 0,
        errors: 0,
        updatedAt: args.now,
      };
      if (prior) await ctx.db.replace(prior._id, value);
      else await ctx.db.insert("dailyUsage", value);
    }
    return args.rows.length;
  },
});

export const finish = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    profileId: v.id("profiles"),
    models: v.array(importedModelValidator),
    totalTokens: v.number(),
    totalCostMicros: v.number(),
    outputTokens: v.number(),
    sessions: v.number(),
    activeDays: v.number(),
    currentStreakDays: v.number(),
    longestStreakDays: v.number(),
    deviceCount: v.number(),
    topModel: v.string(),
    firstDay: v.optional(v.string()),
    lastDay: v.optional(v.string()),
    windows: v.object({
      sevenTokens: v.number(),
      sevenCostMicros: v.number(),
      thirtyTokens: v.number(),
      thirtyCostMicros: v.number(),
    }),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    for (const model of args.models) {
      const prior = await ctx.db.query("modelTotals").withIndex("by_profileId_and_model", (q) => q.eq("profileId", args.profileId).eq("model", model.model)).unique();
      const value = {
        workspaceId: args.workspaceId,
        profileId: args.profileId,
        provider: providerFor(model.model),
        model: model.model,
        totalTokens: model.totalTokens,
        inputTokens: Math.max(0, model.totalTokens - model.outputTokens),
        outputTokens: model.outputTokens,
        costMicros: model.costMicros,
        requests: 0,
        errors: 0,
        lastUsedAt: model.lastUsedAt,
      };
      if (prior) await ctx.db.replace(prior._id, value);
      else await ctx.db.insert("modelTotals", value);
    }

    const priorStats = await ctx.db.query("profileStats").withIndex("by_profileId", (q) => q.eq("profileId", args.profileId)).unique();
    const stats = {
      workspaceId: args.workspaceId,
      profileId: args.profileId,
      totalTokens: args.totalTokens,
      totalCostMicros: args.totalCostMicros,
      inputTokens: Math.max(0, args.totalTokens - args.outputTokens),
      outputTokens: args.outputTokens,
      cacheReadTokens: 0,
      reasoningTokens: 0,
      sessions: args.sessions,
      activeDays: args.activeDays,
      currentStreakDays: args.currentStreakDays,
      longestStreakDays: args.longestStreakDays,
      deviceCount: args.deviceCount,
      topModel: args.topModel,
      firstDay: args.firstDay,
      lastDay: args.lastDay,
      updatedAt: args.now,
    };
    if (priorStats) await ctx.db.replace(priorStats._id, stats);
    else await ctx.db.insert("profileStats", stats);

    const profile = await ctx.db.get(args.profileId);
    if (!profile) throw new ConvexError("PROFILE_NOT_FOUND");
    const periods = [
      { period: "7d" as const, tokens: args.windows.sevenTokens, spend: args.windows.sevenCostMicros },
      { period: "30d" as const, tokens: args.windows.thirtyTokens, spend: args.windows.thirtyCostMicros },
      { period: "all" as const, tokens: args.totalTokens, spend: args.totalCostMicros },
    ];
    for (const period of periods) {
      for (const metric of ["tokens", "spend"] as const) {
        const prior = await ctx.db
          .query("leaderboardEntries")
          .withIndex("by_profileId_and_period_and_metric", (q) => q.eq("profileId", args.profileId).eq("period", period.period).eq("metric", metric))
          .unique();
        const value = {
          workspaceId: args.workspaceId,
          profileId: args.profileId,
          handle: profile.handle,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          verification: profile.verification,
          period: period.period,
          metric,
          score: metric === "tokens" ? period.tokens : period.spend,
          totalTokens: args.totalTokens,
          totalCostMicros: args.totalCostMicros,
          updatedAt: args.now,
        };
        if (prior) await ctx.db.replace(prior._id, value);
        else await ctx.db.insert("leaderboardEntries", value);
      }
    }

    const network = await ctx.db.query("networkStats").withIndex("by_key", (q) => q.eq("key", "global")).unique();
    const networkValue = {
      key: "global",
      totalTokens: args.totalTokens,
      totalCostMicros: args.totalCostMicros,
      totalSessions: args.sessions,
      profiles: 1,
      activeAgents: 0,
      eventsToday: 0,
      updatedAt: args.now,
    };
    if (network) await ctx.db.replace(network._id, networkValue);
    else await ctx.db.insert("networkStats", networkValue);
    return { profileId: args.profileId };
  },
});

export const importTokenMaxxing = action({
  args: { secret: v.string(), handle: v.string(), collectorToken: v.string() },
  handler: async (ctx, args): Promise<{ importedRows: number; skippedRows: number; profileId: Id<"profiles"> }> => {
    if (!process.env.USAGEMAX_IMPORT_SECRET || args.secret !== process.env.USAGEMAX_IMPORT_SECRET) {
      throw new ConvexError("INVALID_IMPORT_SECRET");
    }
    if (args.collectorToken.length < 32) throw new ConvexError("COLLECTOR_TOKEN_TOO_SHORT");
    const handle = cleanText(args.handle, "", 39).toLowerCase();
    if (!/^[a-z0-9-]+$/.test(handle)) throw new ConvexError("INVALID_HANDLE");
    const [profileResponse, dailyResponse] = await Promise.all([
      fetch(`https://api.tokenmaxxing.sh/profiles/${encodeURIComponent(handle)}`),
      fetch(`https://api.tokenmaxxing.sh/profiles/${encodeURIComponent(handle)}/daily`),
    ]);
    if (!profileResponse.ok || !dailyResponse.ok) throw new ConvexError("IMPORT_SOURCE_UNAVAILABLE");
    const profileRoot = record(await profileResponse.json());
    const dailyRoot = record(await dailyResponse.json());
    const user = record(profileRoot?.user);
    const sourceStats = record(profileRoot?.stats);
    const rawDays = Array.isArray(dailyRoot?.days) ? dailyRoot.days : [];
    if (!user || !sourceStats) throw new ConvexError("IMPORT_SOURCE_INVALID");

    const now = Date.now();
    const rows = rawDays.flatMap((value) => {
      const row = record(value);
      const day = typeof row?.date === "string" ? row.date : "";
      const model = cleanText(row?.key, "unknown", 120);
      if (!isValidHistoricalDay(day, now)) return [];
      return [{
        day,
        model,
        outputTokens: Math.max(0, Math.round(number(row?.outputTokens))),
        totalTokens: Math.max(0, Math.round(number(row?.totalTokens))),
        costMicros: Math.max(0, Math.round(number(row?.costUsd) * 1_000_000)),
      }];
    });
    const collectorKeyHash = await sha256(args.collectorToken);
    const ids: { workspaceId: Id<"workspaces">; profileId: Id<"profiles"> } = await ctx.runMutation(internal.imports.begin, {
      handle,
      displayName: cleanText(user.name, handle, 80),
      avatarUrl: typeof user.avatarUrl === "string" ? user.avatarUrl : undefined,
      sourceUrl: `https://tokenmaxxing.sh/${handle}`,
      collectorKeyHash,
      collectorKeyPrefix: args.collectorToken.slice(0, 10),
      now,
    });
    for (let index = 0; index < rows.length; index += 200) {
      await ctx.runMutation(internal.imports.applyDays, {
        ...ids,
        rows: rows.slice(index, index + 200),
        now,
      });
    }

    const modelMap = new Map<string, { model: string; totalTokens: number; outputTokens: number; costMicros: number; lastUsedAt: number }>();
    for (const row of rows) {
      const model = modelMap.get(row.model) ?? { model: row.model, totalTokens: 0, outputTokens: 0, costMicros: 0, lastUsedAt: 0 };
      model.totalTokens += row.totalTokens;
      model.outputTokens += row.outputTokens;
      model.costMicros += row.costMicros;
      model.lastUsedAt = Math.max(model.lastUsedAt, Date.parse(`${row.day}T12:00:00.000Z`));
      modelMap.set(row.model, model);
    }
    const totalTokens = rows.reduce((sum, row) => sum + row.totalTokens, 0);
    const totalCostMicros = rows.reduce((sum, row) => sum + row.costMicros, 0);
    const outputTokens = rows.reduce((sum, row) => sum + row.outputTokens, 0);
    const validDays = [...new Set(rows.map((row) => row.day))].sort();
    const streak = streaks(validDays);
    const sevenCutoff = new Date(now - 7 * DAY_MS).toISOString().slice(0, 10);
    const thirtyCutoff = new Date(now - 30 * DAY_MS).toISOString().slice(0, 10);
    const topModel = [...modelMap.values()].sort((a, b) => b.costMicros - a.costMicros)[0]?.model ?? "unknown";
    await ctx.runMutation(internal.imports.finish, {
      ...ids,
      models: [...modelMap.values()],
      totalTokens,
      totalCostMicros,
      outputTokens,
      sessions: Math.max(0, Math.round(number(sourceStats.sessionCount))),
      activeDays: validDays.length,
      currentStreakDays: streak.current,
      longestStreakDays: streak.longest,
      deviceCount: Math.max(1, Math.round(number(sourceStats.deviceCount))),
      topModel,
      firstDay: validDays[0],
      lastDay: validDays.at(-1),
      windows: {
        sevenTokens: rows.filter((row) => row.day >= sevenCutoff).reduce((sum, row) => sum + row.totalTokens, 0),
        sevenCostMicros: rows.filter((row) => row.day >= sevenCutoff).reduce((sum, row) => sum + row.costMicros, 0),
        thirtyTokens: rows.filter((row) => row.day >= thirtyCutoff).reduce((sum, row) => sum + row.totalTokens, 0),
        thirtyCostMicros: rows.filter((row) => row.day >= thirtyCutoff).reduce((sum, row) => sum + row.costMicros, 0),
      },
      now,
    });
    return { importedRows: rows.length, skippedRows: rawDays.length - rows.length, profileId: ids.profileId };
  },
});
