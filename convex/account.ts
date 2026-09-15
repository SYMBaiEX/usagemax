import { ConvexError, v } from "convex/values";

import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id, TableNames } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { cleanText, sha256 } from "./lib";

const RESERVED_HANDLES = new Set([
  "account",
  "api",
  "callback",
  "docs",
  "enterprise",
  "leaderboard",
  "methodology",
  "privacy",
  "security",
  "sign-in",
  "sign-up",
  "terms",
]);

const LINK_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LINK_CODE_TTL_MS = 10 * 60_000;

async function identityOrThrow(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("AUTH_REQUIRED");
  return identity;
}

async function userForIdentity(ctx: QueryCtx | MutationCtx, identityKey: string) {
  const keyed = await ctx.db
    .query("users")
    .withIndex("by_authIdentityKey", (q) => q.eq("authIdentityKey", identityKey))
    .unique();
  if (keyed) return keyed;
  return ctx.db
    .query("users")
    .withIndex("by_workosUserId", (q) => q.eq("workosUserId", identityKey))
    .unique();
}

function identityKey(identity: Awaited<ReturnType<typeof identityOrThrow>>) {
  return identity.tokenIdentifier || identity.subject;
}

async function profileForUser(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  const owned = await ctx.db.query("profiles").withIndex("by_ownerId", (q) => q.eq("ownerId", userId)).unique();
  if (owned) return owned;
  const membership = await ctx.db.query("workspaceMemberships").withIndex("by_userId_and_workspaceId", (q) =>
    q.eq("userId", userId),
  ).filter((q) => q.eq(q.field("status"), "active")).first();
  return membership
    ? ctx.db.query("profiles").withIndex("by_workspaceId", (q) => q.eq("workspaceId", membership.workspaceId)).first()
    : null;
}

async function audit(ctx: MutationCtx, workspaceId: Id<"workspaces">, actorUserId: Id<"users"> | undefined, action: string, targetType: string, targetId: string | undefined, summary: string) {
  await ctx.db.insert("auditEvents", { workspaceId, actorUserId, action, targetType, targetId, summary, createdAt: Date.now() });
}

async function upsertUser(ctx: MutationCtx) {
  const identity = await identityOrThrow(ctx);
  const now = Date.now();
  const key = identityKey(identity);
  const existing = await userForIdentity(ctx, key) ?? await userForIdentity(ctx, identity.subject);
  const values = {
    name: identity.name,
    email: identity.email,
    avatarUrl: identity.pictureUrl,
    authIdentityKey: key,
    updatedAt: now,
    lastSeenAt: now,
  };
  if (existing) {
    await ctx.db.patch(existing._id, values);
    return { identity, userId: existing._id };
  }
  const userId = await ctx.db.insert("users", {
    workosUserId: identity.subject,
    ...values,
    createdAt: now,
  });
  return { identity, userId };
}

function normalizeHandle(value: string) {
  return value.trim().toLowerCase().replace(/^@/, "");
}

function newCollectorToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `umx_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function newDeviceLinkCode() {
  const characters: string[] = [];
  while (characters.length < 16) {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      const unbiasedLimit = Math.floor(256 / LINK_CODE_ALPHABET.length) * LINK_CODE_ALPHABET.length;
      if (byte >= unbiasedLimit) continue;
      characters.push(LINK_CODE_ALPHABET[byte % LINK_CODE_ALPHABET.length]);
      if (characters.length === 16) break;
    }
  }
  return `UMX-${characters.join("").match(/.{4}/g)!.join("-")}`;
}

export const current = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await userForIdentity(ctx, identityKey(identity)) ?? await userForIdentity(ctx, identity.subject);
    const profile = user
      ? await profileForUser(ctx, user._id)
      : null;
    const collectors = profile
      ? await ctx.db.query("collectors").withIndex("by_workspaceId", (q) => q.eq("workspaceId", profile.workspaceId)).take(20)
      : [];
    const stats = profile
      ? await ctx.db.query("profileStats").withIndex("by_profileId", (q) => q.eq("profileId", profile._id)).unique()
      : null;
    const latestDeletion = user
      ? await ctx.db.query("accountDeletionRequests").withIndex("by_userId_and_requestedAt", (q) => q.eq("userId", user._id)).order("desc").first()
      : null;
    const latestRun = collectors.length
      ? (await Promise.all(collectors.map((collector) => ctx.db.query("snapshotRuns").withIndex("by_collectorId_and_updatedAt", (q) => q.eq("collectorId", collector._id)).order("desc").first())))
          .filter(Boolean)
          .sort((left, right) => (right?.updatedAt ?? 0) - (left?.updatedAt ?? 0))[0]
      : null;
    return {
      user: {
        workosUserId: identity.subject,
        name: identity.name,
        email: identity.email,
        avatarUrl: identity.pictureUrl,
      },
      profile: profile
        ? {
            handle: profile.handle,
            displayName: profile.displayName,
            bio: profile.bio,
            avatarUrl: profile.avatarUrl,
            isPublic: profile.isPublic,
            isVerified: profile.isVerified,
          }
        : null,
      collectors: collectors
        .sort((left, right) => right.createdAt - left.createdAt)
        .map((collector) => ({
          id: collector._id,
          name: collector.name,
          keyPrefix: collector.keyPrefix,
          scopes: collector.scopes,
          platform: collector.platform,
          cliVersion: collector.cliVersion,
          createdAt: collector.createdAt,
          lastSeenAt: collector.lastSeenAt,
          lastSuccessAt: collector.lastSuccessAt,
          lastFailureAt: collector.lastFailureAt,
          lastFailureCode: collector.lastFailureCode,
          lastSyncPhase: collector.lastSyncPhase,
          lastFullSyncAt: collector.lastFullSyncAt,
          coverageStatus: collector.coverageStatus ?? "not_assessed",
          coverageStartDay: collector.coverageStartDay,
          coverageEndDay: collector.coverageEndDay,
          inventoryComplete: collector.inventoryComplete,
          inventoryErrors: collector.inventoryErrors,
          inventoryTruncated: collector.inventoryTruncated,
          sourceCount: collector.sourceCount,
          unresolvedCorrections: collector.unresolvedCorrections,
          rotatedAt: collector.rotatedAt,
          revokedAt: collector.revokedAt,
        })),
      connectedSources: stats?.sources ?? [],
      lastSyncAt: stats?.lastSyncAt ?? stats?.lastEventAt,
      coverage: latestRun ? {
        status: latestRun.inventoryComplete && !latestRun.inventoryTruncated && latestRun.inventoryErrors === 0 ? "complete" : "partial",
        phase: latestRun.status,
        mode: latestRun.mode,
        sourceCount: latestRun.sourceCount,
        partitionCount: latestRun.partitionCount,
        acceptedPartitions: latestRun.acceptedPartitions,
        correctionRows: latestRun.correctionRows,
        inventoryComplete: latestRun.inventoryComplete,
        inventoryErrors: latestRun.inventoryErrors,
        inventoryTruncated: latestRun.inventoryTruncated,
        from: latestRun.coverageStartDay,
        to: latestRun.coverageEndDay,
        completedAt: latestRun.completedAt,
      } : null,
      deletionRequest: latestDeletion && !latestDeletion.cancelledAt && !latestDeletion.completedAt
        ? { requestedAt: latestDeletion.requestedAt, scheduledFor: latestDeletion.scheduledFor }
        : null,
    };
  },
});

export const writeDeviceLink = internalMutation({
  args: {
    workosUserId: v.string(),
    codeHash: v.string(),
    codePrefix: v.string(),
    deviceName: v.string(),
    now: v.number(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await userForIdentity(ctx, args.workosUserId);
    if (!user) throw new ConvexError("PROFILE_REQUIRED");
    const profile = await ctx.db.query("profiles").withIndex("by_ownerId", (q) => q.eq("ownerId", user._id)).unique();
    if (!profile) throw new ConvexError("PROFILE_REQUIRED");
    const links = await ctx.db
      .query("deviceLinkCodes")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", profile.workspaceId))
      .take(20);
    if (links.filter((link) => !link.usedAt && link.expiresAt > args.now).length >= 3) {
      throw new ConvexError("LINK_CODE_LIMIT_REACHED");
    }
    return await ctx.db.insert("deviceLinkCodes", {
      workspaceId: profile.workspaceId,
      profileId: profile._id,
      userId: user._id,
      codeHash: args.codeHash,
      codePrefix: args.codePrefix,
      deviceName: cleanText(args.deviceName, "My computer", 80),
      createdAt: args.now,
      expiresAt: args.expiresAt,
    });
  },
});

export const createDeviceLink = action({
  args: { name: v.string() },
  handler: async (ctx, args): Promise<{ code: string; expiresAt: number; linkId: Id<"deviceLinkCodes"> }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("AUTH_REQUIRED");
    const code = newDeviceLinkCode();
    const now = Date.now();
    const linkId = await ctx.runMutation(internal.account.writeDeviceLink, {
      workosUserId: identityKey(identity),
      codeHash: await sha256(code),
      codePrefix: code.slice(0, 8),
      deviceName: args.name,
      now,
      expiresAt: now + LINK_CODE_TTL_MS,
    });
    return { code, expiresAt: now + LINK_CODE_TTL_MS, linkId };
  },
});

export const redeemDeviceLink = internalMutation({
  args: {
    codeHash: v.string(),
    keyHash: v.string(),
    keyPrefix: v.string(),
    name: v.string(),
    platform: v.optional(v.string()),
    cliVersion: v.optional(v.string()),
    installationIdHash: v.optional(v.string()),
    priorKeyHash: v.optional(v.string()),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const link = await ctx.db.query("deviceLinkCodes").withIndex("by_codeHash", (q) => q.eq("codeHash", args.codeHash)).unique();
    if (!link || link.usedAt || link.expiresAt <= args.now) throw new ConvexError("INVALID_LINK_CODE");
    const profile = await ctx.db.get(link.profileId);
    const workspace = await ctx.db.get(link.workspaceId);
    if (!profile || !workspace || profile.workspaceId !== workspace._id) throw new ConvexError("INVALID_LINK_CODE");
    const collectors = await ctx.db
      .query("collectors")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", link.workspaceId))
      .take(20);
    let existing = args.installationIdHash
      ? await ctx.db
          .query("collectors")
          .withIndex("by_workspaceId_and_installationIdHash", (q) =>
            q.eq("workspaceId", link.workspaceId).eq("installationIdHash", args.installationIdHash),
          )
          .first()
      : null;
    if (!existing && args.priorKeyHash) {
      const prior = await ctx.db.query("collectors").withIndex("by_keyHash", (q) => q.eq("keyHash", args.priorKeyHash!)).unique();
      if (prior?.workspaceId === link.workspaceId) existing = prior;
    }
    if (!existing && collectors.filter((collector) => !collector.revokedAt).length >= 8) {
      throw new ConvexError("COLLECTOR_LIMIT_REACHED");
    }
    const update = {
      name: cleanText(args.name, link.deviceName, 80),
      keyHash: args.keyHash,
      keyPrefix: args.keyPrefix,
      scopes: ["telemetry:write", "outcomes:write"],
      platform: args.platform ? cleanText(args.platform, "unknown", 24) : undefined,
      cliVersion: args.cliVersion ? cleanText(args.cliVersion, "unknown", 24) : undefined,
      installationIdHash: args.installationIdHash,
      lastSeenAt: undefined,
      lastSuccessAt: undefined,
      lastFailureAt: undefined,
      lastFailureCode: undefined,
      revokedAt: undefined,
      rotatedAt: existing ? args.now : undefined,
    };
    const collectorId = existing
      ? (await ctx.db.patch(existing._id, update), existing._id)
      : await ctx.db.insert("collectors", {
          workspaceId: link.workspaceId,
          profileId: link.profileId,
          createdAt: args.now,
          ...update,
        });
    await ctx.db.patch(link._id, { usedAt: args.now, collectorId });
    return { collectorId, handle: profile.handle };
  },
});

export const writeCollector = internalMutation({
  args: {
    workosUserId: v.string(),
    name: v.optional(v.string()),
    keyHash: v.string(),
    keyPrefix: v.string(),
    collectorId: v.optional(v.id("collectors")),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await userForIdentity(ctx, args.workosUserId);
    if (!user) throw new ConvexError("PROFILE_REQUIRED");
    const profile = await ctx.db.query("profiles").withIndex("by_ownerId", (q) => q.eq("ownerId", user._id)).unique();
    if (!profile) throw new ConvexError("PROFILE_REQUIRED");

    if (args.collectorId) {
      const collector = await ctx.db.get(args.collectorId);
      if (!collector || collector.workspaceId !== profile.workspaceId || collector.revokedAt) {
        throw new ConvexError("COLLECTOR_NOT_FOUND");
      }
      await ctx.db.patch(collector._id, {
        name: args.name ?? collector.name,
        keyHash: args.keyHash,
        keyPrefix: args.keyPrefix,
        lastSeenAt: undefined,
        lastSuccessAt: undefined,
        lastFailureAt: undefined,
        lastFailureCode: undefined,
        rotatedAt: args.now,
      });
      return collector._id;
    }

    const existing = await ctx.db
      .query("collectors")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", profile.workspaceId))
      .take(20);
    if (existing.filter((collector) => !collector.revokedAt).length >= 8) {
      throw new ConvexError("COLLECTOR_LIMIT_REACHED");
    }
    return await ctx.db.insert("collectors", {
      workspaceId: profile.workspaceId,
      profileId: profile._id,
      name: args.name ?? "My computer",
      keyHash: args.keyHash,
      keyPrefix: args.keyPrefix,
      scopes: ["telemetry:write", "outcomes:write"],
      createdAt: args.now,
    });
  },
});

export const createCollector = action({
  args: { name: v.string() },
  handler: async (ctx, args): Promise<{ collectorId: Id<"collectors">; token: string; keyPrefix: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("AUTH_REQUIRED");
    const token = newCollectorToken();
    const keyPrefix = token.slice(0, 12);
    const collectorId: Id<"collectors"> = await ctx.runMutation(internal.account.writeCollector, {
      workosUserId: identityKey(identity),
      name: cleanText(args.name, "My computer", 80),
      keyHash: await sha256(token),
      keyPrefix,
      now: Date.now(),
    });
    return { collectorId, token, keyPrefix };
  },
});

export const rotateCollector = action({
  args: { collectorId: v.id("collectors") },
  handler: async (ctx, args): Promise<{ collectorId: Id<"collectors">; token: string; keyPrefix: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("AUTH_REQUIRED");
    const token = newCollectorToken();
    const keyPrefix = token.slice(0, 12);
    const collectorId: Id<"collectors"> = await ctx.runMutation(internal.account.writeCollector, {
      workosUserId: identityKey(identity),
      keyHash: await sha256(token),
      keyPrefix,
      collectorId: args.collectorId,
      now: Date.now(),
    });
    return { collectorId, token, keyPrefix };
  },
});

export const revokeCollector = mutation({
  args: { collectorId: v.id("collectors") },
  handler: async (ctx, args) => {
    const identity = await identityOrThrow(ctx);
    const user = await userForIdentity(ctx, identityKey(identity)) ?? await userForIdentity(ctx, identity.subject);
    if (!user) throw new ConvexError("PROFILE_REQUIRED");
    const profile = await ctx.db.query("profiles").withIndex("by_ownerId", (q) => q.eq("ownerId", user._id)).unique();
    const collector = await ctx.db.get(args.collectorId);
    if (!profile || !collector || collector.workspaceId !== profile.workspaceId) {
      throw new ConvexError("COLLECTOR_NOT_FOUND");
    }
    if (!collector.revokedAt) {
      await ctx.db.patch(collector._id, { revokedAt: Date.now() });
      await audit(ctx, profile.workspaceId, user._id, "collector.revoked", "collector", String(collector._id), `Revoked ${collector.name}`);
    }
    return { collectorId: collector._id, revoked: true };
  },
});

export const ensureProfile = mutation({
  args: { handle: v.string() },
  handler: async (ctx, args) => {
    const handle = normalizeHandle(args.handle);
    if (!/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/.test(handle) || RESERVED_HANDLES.has(handle)) {
      throw new ConvexError("INVALID_HANDLE");
    }

    const { identity, userId } = await upsertUser(ctx);
    const owned = await ctx.db.query("profiles").withIndex("by_ownerId", (q) => q.eq("ownerId", userId)).unique();
    if (owned) return { handle: owned.handle, created: false };

    const existingProfile = await ctx.db.query("profiles").withIndex("by_handle", (q) => q.eq("handle", handle)).unique();
    if (existingProfile) throw new ConvexError("PROFILE_UNAVAILABLE");
    const existingWorkspace = await ctx.db.query("workspaces").withIndex("by_slug", (q) => q.eq("slug", handle)).unique();
    if (existingWorkspace) throw new ConvexError("PROFILE_UNAVAILABLE");

    const now = Date.now();
    const displayName = identity.name?.trim() || handle;
    const workspaceId = await ctx.db.insert("workspaces", {
      ownerId: userId,
      slug: handle,
      name: `${displayName}'s workspace`,
      plan: "free",
      isPublic: false,
      retentionDays: 30,
      createdAt: now,
    });
    await ctx.db.insert("workspaceMemberships", {
      workspaceId,
      userId,
      role: "owner",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const profileId = await ctx.db.insert("profiles", {
      ownerId: userId,
      workspaceId,
      handle,
      displayName,
      bio: "",
      avatarUrl: identity.pictureUrl,
      isPublic: false,
      isVerified: false,
      verification: "account",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("profileStats", {
      workspaceId,
      profileId,
      totalTokens: 0,
      totalCostMicros: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
      sessions: 0,
      activeDays: 0,
      currentStreakDays: 0,
      longestStreakDays: 0,
      deviceCount: 0,
      topModel: "unknown",
      updatedAt: now,
    });

    const shard = [...handle].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 128;
    const counter = await ctx.db.query("networkCounterShards").withIndex("by_shard", (q) => q.eq("shard", shard)).unique();
    if (counter) {
      await ctx.db.patch(counter._id, { profiles: counter.profiles + 1, updatedAt: now });
    } else {
      await ctx.db.insert("networkCounterShards", {
        shard,
        totalTokens: 0,
        totalCostMicros: 0,
        totalSessions: 0,
        profiles: 1,
        eventsDay: new Date(now).toISOString().slice(0, 10),
        eventsToday: 0,
        updatedAt: now,
      });
    }
    return { handle, created: true };
  },
});

export const setProfileVisibility = mutation({
  args: { isPublic: v.boolean() },
  handler: async (ctx, args) => {
    const identity = await identityOrThrow(ctx);
    const user = await userForIdentity(ctx, identityKey(identity)) ?? await userForIdentity(ctx, identity.subject);
    if (!user) throw new ConvexError("PROFILE_REQUIRED");
    const profile = await ctx.db.query("profiles").withIndex("by_ownerId", (q) => q.eq("ownerId", user._id)).unique();
    if (!profile) throw new ConvexError("PROFILE_REQUIRED");
    await ctx.db.patch(profile._id, { isPublic: args.isPublic, updatedAt: Date.now() });
    await ctx.db.patch(profile.workspaceId, { isPublic: args.isPublic });
    const entries = await ctx.db
      .query("leaderboardEntries")
      .withIndex("by_profileId_and_period_and_metric", (q) => q.eq("profileId", profile._id))
      .collect();
    for (const entry of entries) await ctx.db.patch(entry._id, { isPublic: args.isPublic });
    await audit(ctx, profile.workspaceId, user._id, "profile.visibility_changed", "profile", String(profile._id), args.isPublic ? "Made profile public" : "Made profile private");
    return { handle: profile.handle, isPublic: args.isPublic };
  },
});

export const deviceLinkStatus = query({
  args: { linkId: v.id("deviceLinkCodes") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await userForIdentity(ctx, identityKey(identity)) ?? await userForIdentity(ctx, identity.subject);
    const link = await ctx.db.get(args.linkId);
    if (!user || !link || link.userId !== user._id) return null;
    const collector = link.collectorId ? await ctx.db.get(link.collectorId) : null;
    return {
      createdAt: link.createdAt,
      expiresAt: link.expiresAt,
      redeemedAt: link.usedAt,
      collectorName: collector?.name,
      firstUploadAt: collector?.lastSuccessAt,
      syncPhase: collector?.lastSyncPhase,
      failedAt: collector?.lastFailureAt,
      failureCode: collector?.lastFailureCode,
    };
  },
});

export const updateProfile = mutation({
  args: { displayName: v.string(), bio: v.string() },
  handler: async (ctx, args) => {
    const identity = await identityOrThrow(ctx);
    const user = await userForIdentity(ctx, identityKey(identity)) ?? await userForIdentity(ctx, identity.subject);
    if (!user) throw new ConvexError("PROFILE_REQUIRED");
    const profile = await ctx.db.query("profiles").withIndex("by_ownerId", (q) => q.eq("ownerId", user._id)).unique();
    if (!profile) throw new ConvexError("PROFILE_REQUIRED");
    const displayName = cleanText(args.displayName, "", 80);
    const bio = cleanText(args.bio, "", 280);
    if (!displayName) throw new ConvexError("DISPLAY_NAME_REQUIRED");
    const now = Date.now();
    await ctx.db.patch(profile._id, { displayName, bio, updatedAt: now });
    const entries = await ctx.db.query("leaderboardEntries").withIndex("by_profileId_and_period_and_metric", (q) => q.eq("profileId", profile._id)).collect();
    for (const entry of entries) await ctx.db.patch(entry._id, { displayName, updatedAt: now });
    await audit(ctx, profile.workspaceId, user._id, "profile.updated", "profile", String(profile._id), "Updated profile details");
    return { displayName, bio };
  },
});

export const renameCollector = mutation({
  args: { collectorId: v.id("collectors"), name: v.string() },
  handler: async (ctx, args) => {
    const identity = await identityOrThrow(ctx);
    const user = await userForIdentity(ctx, identityKey(identity)) ?? await userForIdentity(ctx, identity.subject);
    if (!user) throw new ConvexError("PROFILE_REQUIRED");
    const profile = await ctx.db.query("profiles").withIndex("by_ownerId", (q) => q.eq("ownerId", user._id)).unique();
    const collector = await ctx.db.get(args.collectorId);
    if (!profile || !collector || collector.workspaceId !== profile.workspaceId) throw new ConvexError("COLLECTOR_NOT_FOUND");
    const name = cleanText(args.name, "", 80);
    if (!name) throw new ConvexError("COLLECTOR_NAME_REQUIRED");
    await ctx.db.patch(collector._id, { name });
    await audit(ctx, profile.workspaceId, user._id, "collector.renamed", "collector", String(collector._id), `Renamed collector to ${name}`);
    return { collectorId: collector._id, name };
  },
});

export const exportAccount = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("AUTH_REQUIRED");
    const user = await userForIdentity(ctx, identityKey(identity)) ?? await userForIdentity(ctx, identity.subject);
    if (!user) throw new ConvexError("PROFILE_REQUIRED");
    const profile = await ctx.db.query("profiles").withIndex("by_ownerId", (q) => q.eq("ownerId", user._id)).unique();
    if (!profile) throw new ConvexError("PROFILE_REQUIRED");
    const [workspace, stats, collectors, daily, models, auditLog] = await Promise.all([
      ctx.db.get(profile.workspaceId),
      ctx.db.query("profileStats").withIndex("by_profileId", (q) => q.eq("profileId", profile._id)).unique(),
      ctx.db.query("collectors").withIndex("by_workspaceId", (q) => q.eq("workspaceId", profile.workspaceId)).collect(),
      ctx.db.query("profileDailyTotals").withIndex("by_profileId_and_day", (q) => q.eq("profileId", profile._id)).order("desc").take(730),
      ctx.db.query("modelTotals").withIndex("by_profileId_and_totalTokens", (q) => q.eq("profileId", profile._id)).order("desc").take(500),
      ctx.db.query("auditEvents").withIndex("by_workspaceId_and_createdAt", (q) => q.eq("workspaceId", profile.workspaceId)).order("desc").take(500),
    ]);
    return {
      exportedAt: Date.now(),
      formatVersion: 1,
      user: { name: user.name, email: user.email, createdAt: user.createdAt },
      workspace: workspace ? { slug: workspace.slug, name: workspace.name, plan: workspace.plan, retentionDays: workspace.retentionDays } : null,
      profile: { handle: profile.handle, displayName: profile.displayName, bio: profile.bio, isPublic: profile.isPublic, createdAt: profile.createdAt },
      stats,
      collectors: collectors.map((collector) => ({
        id: collector._id,
        name: collector.name,
        keyPrefix: collector.keyPrefix,
        scopes: collector.scopes,
        platform: collector.platform,
        cliVersion: collector.cliVersion,
        createdAt: collector.createdAt,
        lastSeenAt: collector.lastSeenAt,
        lastSuccessAt: collector.lastSuccessAt,
        rotatedAt: collector.rotatedAt,
        revokedAt: collector.revokedAt,
      })),
      daily,
      models,
      auditLog,
      limits: { dailyDays: 730, models: 500, auditEvents: 500 },
    };
  },
});

export const requestAccountDeletion = mutation({
  args: { confirmation: v.string() },
  handler: async (ctx, args) => {
    const identity = await identityOrThrow(ctx);
    const user = await userForIdentity(ctx, identityKey(identity)) ?? await userForIdentity(ctx, identity.subject);
    if (!user || args.confirmation.trim().toLowerCase() !== "delete my account") throw new ConvexError("CONFIRMATION_REQUIRED");
    const profile = await ctx.db.query("profiles").withIndex("by_ownerId", (q) => q.eq("ownerId", user._id)).unique();
    if (!profile) throw new ConvexError("PROFILE_REQUIRED");
    const now = Date.now();
    const existing = await ctx.db.query("accountDeletionRequests").withIndex("by_userId_and_requestedAt", (q) => q.eq("userId", user._id)).order("desc").first();
    if (existing && !existing.cancelledAt && !existing.completedAt) return { scheduledFor: existing.scheduledFor, replay: true };
    const scheduledFor = now + 7 * 24 * 60 * 60 * 1000;
    const requestId = await ctx.db.insert("accountDeletionRequests", {
      workspaceId: profile.workspaceId,
      userId: user._id,
      profileId: profile._id,
      requestedAt: now,
      scheduledFor,
      stage: "privacy",
      processedRows: 0,
    });
    const collectors = await ctx.db.query("collectors").withIndex("by_workspaceId", (q) => q.eq("workspaceId", profile.workspaceId)).collect();
    for (const collector of collectors) if (!collector.revokedAt) await ctx.db.patch(collector._id, { revokedAt: now });
    await audit(ctx, profile.workspaceId, user._id, "account.deletion_requested", "workspace", String(profile.workspaceId), "Requested account deletion with seven-day recovery window");
    await ctx.scheduler.runAt(scheduledFor, internal.account.processAccountDeletion, { requestId });
    return { scheduledFor, replay: false };
  },
});

export const cancelAccountDeletion = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await identityOrThrow(ctx);
    const user = await userForIdentity(ctx, identityKey(identity)) ?? await userForIdentity(ctx, identity.subject);
    if (!user) throw new ConvexError("PROFILE_REQUIRED");
    const request = await ctx.db.query("accountDeletionRequests").withIndex("by_userId_and_requestedAt", (q) => q.eq("userId", user._id)).order("desc").first();
    if (!request || request.cancelledAt || request.completedAt) return { cancelled: false };
    const now = Date.now();
    await ctx.db.patch(request._id, { cancelledAt: now });
    const collectors = await ctx.db.query("collectors").withIndex("by_workspaceId", (q) => q.eq("workspaceId", request.workspaceId)).collect();
    for (const collector of collectors) {
      if (collector.revokedAt === request.requestedAt) await ctx.db.patch(collector._id, { revokedAt: undefined });
    }
    await audit(ctx, request.workspaceId, user._id, "account.deletion_cancelled", "workspace", String(request.workspaceId), "Cancelled account deletion");
    return { cancelled: true };
  },
});

const deletionStages = [
  "privacy", "leaderboard", "telemetry", "outcomes", "agents", "dailyUsage",
  "dailyTotals", "dimensions", "devices", "models", "snapshots",
  "collectorSessions", "ingestReceipts", "rateBuckets", "sessionReceipts",
  "snapshotRuns", "snapshotReceipts", "deviceLinks", "collectors", "stats",
  "audits", "memberships", "profile", "workspace", "user", "complete",
] as const;

type DeletionStage = (typeof deletionStages)[number];

async function advanceDeletion(
  ctx: MutationCtx,
  requestId: Id<"accountDeletionRequests">,
  current: DeletionStage,
  processedRows: number,
) {
  const next = deletionStages[deletionStages.indexOf(current) + 1] ?? "complete";
  await ctx.db.patch(requestId, { stage: next, processedRows, startedAt: Date.now() });
  await ctx.scheduler.runAfter(0, internal.account.processAccountDeletion, { requestId });
}

async function repeatDeletion(
  ctx: MutationCtx,
  requestId: Id<"accountDeletionRequests">,
  processedRows: number,
) {
  await ctx.db.patch(requestId, { processedRows });
  await ctx.scheduler.runAfter(0, internal.account.processAccountDeletion, { requestId });
}

/**
 * Bounded, resumable hard deletion. Each invocation removes at most 100 rows
 * from one table, then schedules the next slice. Aggregate network counters are
 * deliberately retained as anonymous service-level statistics.
 */
export const processAccountDeletion = internalMutation({
  args: { requestId: v.id("accountDeletionRequests") },
  handler: async (ctx, { requestId }) => {
    const request = await ctx.db.get(requestId);
    if (!request || request.cancelledAt || request.completedAt || request.scheduledFor > Date.now()) return { processed: false };
    const stage = deletionStages.includes(request.stage as DeletionStage) ? request.stage as DeletionStage : "privacy";
    const profileId = request.profileId;
    const remove = async <T extends { _id: Id<TableNames> }>(rows: T[]) => {
      for (const row of rows) await ctx.db.delete(row._id);
      return (request.processedRows ?? 0) + rows.length;
    };
    const finishRows = async <T extends { _id: Id<TableNames> }>(rows: T[]) => {
      const processed = await remove(rows);
      if (rows.length) await repeatDeletion(ctx, requestId, processed);
      else await advanceDeletion(ctx, requestId, stage, processed);
      return { processed: true, stage, rows: rows.length };
    };
    const collectors = () => ctx.db.query("collectors").withIndex("by_workspaceId", (q) => q.eq("workspaceId", request.workspaceId)).collect();

    if (stage === "privacy") {
      const profile = profileId ? await ctx.db.get(profileId) : null;
      const workspace = await ctx.db.get(request.workspaceId);
      if (profile) await ctx.db.patch(profile._id, { isPublic: false, displayName: "Deleted account", bio: "", avatarUrl: undefined, updatedAt: Date.now() });
      if (workspace) await ctx.db.patch(workspace._id, { isPublic: false, name: "Deleted account" });
      await advanceDeletion(ctx, requestId, stage, request.processedRows ?? 0);
      return { processed: true, stage, rows: 0 };
    }
    if (stage === "leaderboard") return finishRows(profileId ? await ctx.db.query("leaderboardEntries").withIndex("by_profileId_and_period_and_metric", (q) => q.eq("profileId", profileId)).take(100) : []);
    if (stage === "telemetry") return finishRows(profileId ? await ctx.db.query("telemetryEvents").withIndex("by_profileId_and_occurredAt", (q) => q.eq("profileId", profileId)).take(100) : []);
    if (stage === "outcomes") return finishRows(profileId ? await ctx.db.query("outcomes").withIndex("by_profileId_and_occurredAt", (q) => q.eq("profileId", profileId)).take(100) : []);
    if (stage === "agents") return finishRows(profileId ? await ctx.db.query("agentLiveStats").withIndex("by_profileId_and_updatedAt", (q) => q.eq("profileId", profileId)).take(100) : []);
    if (stage === "dailyUsage") return finishRows(profileId ? await ctx.db.query("dailyUsage").withIndex("by_profileId_and_day", (q) => q.eq("profileId", profileId)).take(100) : []);
    if (stage === "dailyTotals") return finishRows(profileId ? await ctx.db.query("profileDailyTotals").withIndex("by_profileId_and_day", (q) => q.eq("profileId", profileId)).take(100) : []);
    if (stage === "dimensions") return finishRows(profileId ? await ctx.db.query("dailyDimensions").withIndex("by_profileId_and_dimension_and_day", (q) => q.eq("profileId", profileId)).take(100) : []);
    if (stage === "devices") return finishRows(profileId ? await ctx.db.query("profileDevices").withIndex("by_profileId", (q) => q.eq("profileId", profileId)).take(100) : []);
    if (stage === "models") return finishRows(profileId ? await ctx.db.query("modelTotals").withIndex("by_profileId_and_totalTokens", (q) => q.eq("profileId", profileId)).take(100) : []);
    if (stage === "snapshots") return finishRows(profileId ? await ctx.db.query("collectorUsageSnapshots").withIndex("by_profileId_and_day", (q) => q.eq("profileId", profileId)).take(100) : []);
    if (stage === "collectorSessions") return finishRows(profileId ? await ctx.db.query("collectorSessions").withIndex("by_profileId_and_lastActivityAt", (q) => q.eq("profileId", profileId)).take(100) : []);

    if (["ingestReceipts", "rateBuckets", "sessionReceipts", "snapshotRuns", "snapshotReceipts"].includes(stage)) {
      for (const collector of await collectors()) {
        const rows = stage === "ingestReceipts"
          ? await ctx.db.query("ingestReceipts").withIndex("by_collectorId_and_batchId", (q) => q.eq("collectorId", collector._id)).take(100)
          : stage === "rateBuckets"
            ? await ctx.db.query("ingestRateBuckets").withIndex("by_collectorId_and_bucketStart", (q) => q.eq("collectorId", collector._id)).take(100)
            : stage === "sessionReceipts"
              ? await ctx.db.query("sessionReceipts").withIndex("by_collectorId_and_source_and_sessionId", (q) => q.eq("collectorId", collector._id)).take(100)
              : stage === "snapshotRuns"
                ? await ctx.db.query("snapshotRuns").withIndex("by_collectorId_and_updatedAt", (q) => q.eq("collectorId", collector._id)).take(100)
                : await ctx.db.query("snapshotReceipts").withIndex("by_collectorId_and_partitionId", (q) => q.eq("collectorId", collector._id)).take(100);
        if (rows.length) {
          for (const row of rows) await ctx.db.delete(row._id);
          const processed = (request.processedRows ?? 0) + rows.length;
          await repeatDeletion(ctx, requestId, processed);
          return { processed: true, stage, rows: rows.length };
        }
      }
      await advanceDeletion(ctx, requestId, stage, request.processedRows ?? 0);
      return { processed: true, stage, rows: 0 };
    }

    if (stage === "deviceLinks") return finishRows(await ctx.db.query("deviceLinkCodes").withIndex("by_workspaceId", (q) => q.eq("workspaceId", request.workspaceId)).take(100));
    if (stage === "collectors") return finishRows((await collectors()).slice(0, 100));
    if (stage === "stats") return finishRows(await ctx.db.query("profileStats").withIndex("by_workspaceId", (q) => q.eq("workspaceId", request.workspaceId)).take(100));
    if (stage === "audits") return finishRows(await ctx.db.query("auditEvents").withIndex("by_workspaceId_and_createdAt", (q) => q.eq("workspaceId", request.workspaceId)).take(100));
    if (stage === "memberships") return finishRows(await ctx.db.query("workspaceMemberships").withIndex("by_workspaceId_and_userId", (q) => q.eq("workspaceId", request.workspaceId)).take(100));
    if (stage === "profile") {
      const profile = profileId ? await ctx.db.get(profileId) : null;
      return finishRows(profile ? [profile] : []);
    }
    if (stage === "workspace") {
      const workspace = await ctx.db.get(request.workspaceId);
      return finishRows(workspace ? [workspace] : []);
    }
    if (stage === "user") {
      const remainingMembership = await ctx.db.query("workspaceMemberships").withIndex("by_userId_and_workspaceId", (q) => q.eq("userId", request.userId)).first();
      const remainingWorkspace = await ctx.db.query("workspaces").withIndex("by_ownerId", (q) => q.eq("ownerId", request.userId)).first();
      const user = await ctx.db.get(request.userId);
      if (user && !remainingMembership && !remainingWorkspace) await ctx.db.delete(user._id);
      await advanceDeletion(ctx, requestId, stage, (request.processedRows ?? 0) + Number(Boolean(user && !remainingMembership && !remainingWorkspace)));
      return { processed: true, stage, rows: Number(Boolean(user && !remainingMembership && !remainingWorkspace)) };
    }
    await ctx.db.patch(requestId, { stage: "complete", completedAt: Date.now() });
    return { processed: true, stage: "complete", rows: 0 };
  },
});

export const processDueDeletionRequests = internalMutation({
  args: {},
  handler: async (ctx) => {
    const due = await ctx.db.query("accountDeletionRequests").withIndex("by_scheduledFor", (q) => q.lte("scheduledFor", Date.now())).take(10);
    let queued = 0;
    for (const request of due) {
      if (request.cancelledAt || request.completedAt) continue;
      await ctx.scheduler.runAfter(0, internal.account.processAccountDeletion, { requestId: request._id });
      queued += 1;
    }
    return { queued };
  },
});
