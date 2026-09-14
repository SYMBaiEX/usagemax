import { ConvexError, v } from "convex/values";

import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
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

async function userForIdentity(ctx: QueryCtx | MutationCtx, subject: string) {
  return ctx.db
    .query("users")
    .withIndex("by_workosUserId", (q) => q.eq("workosUserId", subject))
    .unique();
}

async function upsertUser(ctx: MutationCtx) {
  const identity = await identityOrThrow(ctx);
  const now = Date.now();
  const existing = await userForIdentity(ctx, identity.subject);
  const values = {
    name: identity.name,
    email: identity.email,
    avatarUrl: identity.pictureUrl,
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
    const user = await userForIdentity(ctx, identity.subject);
    const profile = user
      ? await ctx.db.query("profiles").withIndex("by_ownerId", (q) => q.eq("ownerId", user._id)).unique()
      : null;
    const collectors = profile
      ? await ctx.db.query("collectors").withIndex("by_workspaceId", (q) => q.eq("workspaceId", profile.workspaceId)).take(20)
      : [];
    const stats = profile
      ? await ctx.db.query("profileStats").withIndex("by_profileId", (q) => q.eq("profileId", profile._id)).unique()
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
          rotatedAt: collector.rotatedAt,
          revokedAt: collector.revokedAt,
        })),
      connectedSources: stats?.sources ?? [],
      lastSyncAt: stats?.lastSyncAt ?? stats?.lastEventAt,
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
  handler: async (ctx, args): Promise<{ code: string; expiresAt: number }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("AUTH_REQUIRED");
    const code = newDeviceLinkCode();
    const now = Date.now();
    await ctx.runMutation(internal.account.writeDeviceLink, {
      workosUserId: identity.subject,
      codeHash: await sha256(code),
      codePrefix: code.slice(0, 8),
      deviceName: args.name,
      now,
      expiresAt: now + LINK_CODE_TTL_MS,
    });
    return { code, expiresAt: now + LINK_CODE_TTL_MS };
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
      workosUserId: identity.subject,
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
      workosUserId: identity.subject,
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
    const user = await userForIdentity(ctx, identity.subject);
    if (!user) throw new ConvexError("PROFILE_REQUIRED");
    const profile = await ctx.db.query("profiles").withIndex("by_ownerId", (q) => q.eq("ownerId", user._id)).unique();
    const collector = await ctx.db.get(args.collectorId);
    if (!profile || !collector || collector.workspaceId !== profile.workspaceId) {
      throw new ConvexError("COLLECTOR_NOT_FOUND");
    }
    if (!collector.revokedAt) await ctx.db.patch(collector._id, { revokedAt: Date.now() });
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
    const user = await userForIdentity(ctx, identity.subject);
    if (!user) throw new ConvexError("PROFILE_REQUIRED");
    const profile = await ctx.db.query("profiles").withIndex("by_ownerId", (q) => q.eq("ownerId", user._id)).unique();
    if (!profile) throw new ConvexError("PROFILE_REQUIRED");
    await ctx.db.patch(profile._id, { isPublic: args.isPublic });
    await ctx.db.patch(profile.workspaceId, { isPublic: args.isPublic });
    const entries = await ctx.db
      .query("leaderboardEntries")
      .withIndex("by_profileId_and_period_and_metric", (q) => q.eq("profileId", profile._id))
      .collect();
    for (const entry of entries) await ctx.db.patch(entry._id, { isPublic: args.isPublic });
    return { handle: profile.handle, isPublic: args.isPublic };
  },
});
