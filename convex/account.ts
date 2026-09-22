import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { UserIdentity } from "convex/server";

import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { cleanText, sha256 } from "./lib";
import { productPolicy } from "./productPolicy";
import { resolveDeviceName } from "./device_name";

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
  "workspace",
  "dashboard",
  "pricing",
]);

const LINK_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LINK_CODE_TTL_MS = 10 * 60_000;

export const WORKSPACE_PERMISSIONS = [
  "workspace:manage",
  "workspace:delete",
  "profile:manage",
  "collectors:manage",
  "data:export",
  "audit:read",
  "collectors:self",
  "members:manage",
  "teams:manage",
  "finance:read",
  "finance:manage",
  "billing:read",
  "billing:manage",
  "integrations:manage",
] as const;
export type WorkspacePermission = (typeof WORKSPACE_PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<string, ReadonlySet<WorkspacePermission>> = {
  owner: new Set(WORKSPACE_PERMISSIONS),
  admin: new Set(WORKSPACE_PERMISSIONS.filter((permission) => permission !== "workspace:delete")),
  finance: new Set(["finance:read", "finance:manage", "billing:read", "billing:manage", "data:export"]),
  manager: new Set(["teams:manage", "collectors:self"]),
  auditor: new Set(["audit:read", "finance:read", "data:export"]),
  member: new Set(["collectors:self"]),
  viewer: new Set(),
};

export type AccessReference = {
  identityKey: string;
  subject: string;
  organizationId?: string;
  issuedAt?: number;
  roles: string[];
  permissions: string[];
  permissionsAuthoritative: boolean;
};

export const accessReferenceValidator = v.object({
  identityKey: v.string(),
  subject: v.string(),
  organizationId: v.optional(v.string()),
  issuedAt: v.optional(v.number()),
  roles: v.array(v.string()),
  permissions: v.array(v.string()),
  permissionsAuthoritative: v.boolean(),
});

function stringClaim(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArrayClaim(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim())).map((entry) => entry.trim()))]
    : [];
}

function issuedAtClaim(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return value < 1_000_000_000_000 ? Math.round(value * 1000) : Math.round(value);
}

export function accessReference(identity: UserIdentity): AccessReference {
  const roles = stringArrayClaim(identity.roles);
  const role = stringClaim(identity.role);
  if (role && !roles.includes(role)) roles.unshift(role);
  return {
    identityKey: identityKey(identity),
    subject: identity.subject,
    organizationId: stringClaim(identity.org_id),
    issuedAt: issuedAtClaim(identity.iat),
    roles,
    permissions: stringArrayClaim(identity.permissions),
    permissionsAuthoritative: Array.isArray(identity.permissions),
  };
}

async function identityOrThrow(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("AUTH_REQUIRED");
  return identity;
}

export async function userForIdentity(ctx: QueryCtx | MutationCtx, identityKey: string) {
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

function identityKey(identity: UserIdentity) {
  return identity.tokenIdentifier || identity.subject;
}

async function workspaceAccessForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  reference: Pick<AccessReference, "organizationId" | "roles" | "permissions">,
) {
  let workspace: Doc<"workspaces"> | null = null;
  let membership: Doc<"workspaceMemberships"> | null = null;
  let profile: Doc<"profiles"> | null = null;
  const personalSelected = (await ctx.db.get(userId))?.preferPersonalWorkspace === true;
  if (reference.organizationId && !personalSelected) {
    workspace = await ctx.db.query("workspaces").withIndex("by_workosOrganizationId", (q) =>
      q.eq("workosOrganizationId", reference.organizationId),
    ).unique();
    if (!workspace || workspace.accessDisabledAt) return null;
    membership = await ctx.db.query("workspaceMemberships").withIndex("by_userId_and_workspaceId", (q) =>
      q.eq("userId", userId).eq("workspaceId", workspace!._id),
    ).unique();
    if (!membership || membership.status !== "active") return null;
    profile = await ctx.db.query("profiles").withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspace!._id)).first();
  } else {
    const ownedProfiles = await ctx.db.query("profiles").withIndex("by_ownerId", (q) => q.eq("ownerId", userId)).take(20);
    for (const candidate of ownedProfiles) {
      const candidateWorkspace = await ctx.db.get(candidate.workspaceId);
      if (!candidateWorkspace || candidateWorkspace.workosOrganizationId || candidateWorkspace.ownerId !== userId || candidateWorkspace.accessDisabledAt) continue;
      const candidateMembership = await ctx.db.query("workspaceMemberships").withIndex("by_userId_and_workspaceId", (q) =>
        q.eq("userId", userId).eq("workspaceId", candidateWorkspace._id),
      ).unique();
      if (candidateMembership?.status !== "active") continue;
      workspace = candidateWorkspace;
      membership = candidateMembership;
      profile = candidate;
      break;
    }
  }
  return workspace && membership ? { workspace, membership, profile } : null;
}

export function hasWorkspacePermission(
  access: NonNullable<Awaited<ReturnType<typeof workspaceAccessForUser>>>,
  reference: Pick<AccessReference, "organizationId" | "issuedAt" | "roles" | "permissions" | "permissionsAuthoritative">,
  permission: WorkspacePermission,
) {
  if (!access.workspace.workosOrganizationId && access.workspace.ownerId === access.membership.userId && access.membership.source === "personal") return true;
  if (access.workspace.workosOrganizationId && access.workspace.workosOrganizationId !== reference.organizationId) return false;
  if (access.membership.authorizationChangedAt && (!reference.issuedAt || reference.issuedAt < access.membership.authorizationChangedAt)) {
    return false;
  }
  if (reference.permissionsAuthoritative) return reference.permissions.includes(permission) || (permission === "collectors:self" && reference.permissions.includes("collectors:manage"));
  const roles = reference.roles.length ? reference.roles : [access.membership.role];
  return roles.some((role) => ROLE_PERMISSIONS[role]?.has(permission));
}

export async function requireWorkspaceMembership(ctx: QueryCtx | MutationCtx) {
  const identity = await identityOrThrow(ctx);
  const reference = accessReference(identity);
  const user = await userForIdentity(ctx, reference.identityKey) ?? await userForIdentity(ctx, reference.subject);
  if (!user) throw new ConvexError("PROFILE_REQUIRED");
  const access = await workspaceAccessForUser(ctx, user._id, reference);
  if (!access?.profile) throw new ConvexError("PROFILE_REQUIRED");
  return { identity, reference, user, ...access, profile: access.profile };
}

export async function requireWorkspaceAccess(ctx: QueryCtx | MutationCtx, permission: WorkspacePermission) {
  const result = await requireWorkspaceMembership(ctx);
  const { reference, ...access } = result;
  if (!hasWorkspacePermission(access, reference, permission)) throw new ConvexError("FORBIDDEN");
  return result;
}

export async function requireWorkspaceAccessForReference(ctx: QueryCtx | MutationCtx, reference: AccessReference, permission: WorkspacePermission) {
  const user = await userForIdentity(ctx, reference.identityKey) ?? await userForIdentity(ctx, reference.subject);
  if (!user) throw new ConvexError("PROFILE_REQUIRED");
  const access = await workspaceAccessForUser(ctx, user._id, reference);
  if (!access?.profile) throw new ConvexError("PROFILE_REQUIRED");
  if (!hasWorkspacePermission(access, reference, permission)) throw new ConvexError("FORBIDDEN");
  return { user, ...access, profile: access.profile };
}

async function requireOwnCollectorAccess(ctx: QueryCtx | MutationCtx, collectorId: Id<"collectors">) {
  const access = await requireWorkspaceMembership(ctx);
  const collector = await ctx.db.get(collectorId);
  if (!collector || collector.workspaceId !== access.workspace._id) throw new ConvexError("COLLECTOR_NOT_FOUND");
  if (!hasWorkspacePermission(access, access.reference, "collectors:manage") &&
      !(hasWorkspacePermission(access, access.reference, "collectors:self") && collector.ownerUserId === access.user._id)) throw new ConvexError("FORBIDDEN");
  return { ...access, collector };
}

export async function audit(ctx: MutationCtx, workspaceId: Id<"workspaces">, actorUserId: Id<"users"> | undefined, action: string, targetType: string, targetId: string | undefined, summary: string) {
  await ctx.db.insert("auditEvents", { workspaceId, actorUserId, action, targetType, targetId, summary, createdAt: Date.now() });
}

export async function upsertUser(ctx: MutationCtx) {
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

function referenceHasPermission(
  reference: Pick<AccessReference, "roles" | "permissions" | "permissionsAuthoritative">,
  permission: WorkspacePermission,
) {
  if (reference.permissionsAuthoritative) return reference.permissions.includes(permission);
  return reference.roles.some((role) => ROLE_PERMISSIONS[role]?.has(permission));
}

function collectorLimit(plan: Doc<"workspaces">["plan"]) {
  return productPolicy(plan).devices;
}

export async function syncOrganizationMembership(
  ctx: MutationCtx,
  workspace: Doc<"workspaces">,
  userId: Id<"users">,
  reference: AccessReference,
  now: number,
) {
  if (!reference.organizationId || workspace.workosOrganizationId !== reference.organizationId) {
    throw new ConvexError("ORGANIZATION_MISMATCH");
  }
  const existing = await ctx.db.query("workspaceMemberships").withIndex("by_userId_and_workspaceId", (q) =>
    q.eq("userId", userId).eq("workspaceId", workspace._id),
  ).unique();
  if (existing?.authorizationChangedAt && (!reference.issuedAt || reference.issuedAt < existing.authorizationChangedAt)) {
    throw new ConvexError("SESSION_REFRESH_REQUIRED");
  }
  const roles = reference.roles.length ? reference.roles : ["member"];
  const values = {
    workosOrganizationId: reference.organizationId,
    role: roles[0],
    roles,
    permissions: reference.permissions,
    source: "workos" as const,
    status: "active" as const,
    lastSyncedAt: now,
    updatedAt: now,
  };
  if (existing) {
    await ctx.db.patch(existing._id, values);
    return existing._id;
  }
  return await ctx.db.insert("workspaceMemberships", {
    workspaceId: workspace._id,
    userId,
    createdAt: now,
    ...values,
  });
}

export async function createProfileRecords(
  ctx: MutationCtx,
  workspace: Doc<"workspaces">,
  ownerId: Id<"users">,
  actorUserId: Id<"users">,
  handle: string,
  displayName: string,
  avatarUrl: string | undefined,
  now: number,
) {
  const profileId = await ctx.db.insert("profiles", {
    ownerId,
    workspaceId: workspace._id,
    handle,
    displayName,
    bio: "",
    avatarUrl,
    isPublic: false,
    isVerified: false,
    verification: "account",
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("profileStats", {
    workspaceId: workspace._id,
    profileId,
    totalTokens: 0,
    totalCostMicros: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    unclassifiedTokens: 0,
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
  await audit(ctx, workspace._id, actorUserId, "profile.created", "profile", String(profileId), `Created @${handle}`);
  return profileId;
}

function collectorView(collector: Doc<"collectors">) {
  return {
    id: collector._id,
    ownerUserId: collector.ownerUserId,
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
  };
}

// This is intentionally a diagnostic projection. It proves the state of a
// credential without returning its hash, installation UUID, or any other
// secret-bearing value. A caller that presents a valid key may see the
// account-side name and profile it is already authorized to write to.
export const inspectCollector = internalQuery({
  args: {
    keyHash: v.string(),
    installationIdHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const collector = await ctx.db
      .query("collectors")
      .withIndex("by_keyHash", (q) => q.eq("keyHash", args.keyHash))
      .unique();
    if (!collector) return null;

    const workspace = await ctx.db.get(collector.workspaceId);
    const profile = await ctx.db.get(collector.profileId);
    let membershipActive = true;
    if (workspace?.workosOrganizationId && collector.ownerUserId) {
      const member = await ctx.db
        .query("workspaceMemberships")
        .withIndex("by_userId_and_workspaceId", (q) =>
          q.eq("userId", collector.ownerUserId!).eq("workspaceId", collector.workspaceId),
        )
        .unique();
      membershipActive = member?.status === "active";
    }

    let status: "active" | "revoked" | "workspace_disabled" | "membership_inactive" | "device_mismatch" | "scope_missing" = "active";
    if (collector.revokedAt) status = "revoked";
    else if (!workspace || workspace.accessDisabledAt) status = "workspace_disabled";
    else if (!membershipActive) status = "membership_inactive";
    else if (collector.installationIdHash && args.installationIdHash && collector.installationIdHash !== args.installationIdHash) status = "device_mismatch";
    else if (!collector.scopes.includes("telemetry:write")) status = "scope_missing";

    const deviceBinding = !collector.installationIdHash
      ? "unbound" as const
      : args.installationIdHash
        ? collector.installationIdHash === args.installationIdHash ? "matched" as const : "mismatch" as const
        : "bound" as const;

    return {
      status,
      credentialType: "collector" as const,
      writeOnly: true,
      activation: "not_required" as const,
      expiresAt: null,
      scopes: collector.scopes,
      scopeStatus: collector.scopes.includes("telemetry:write") ? "valid" as const : "missing_telemetry_write" as const,
      ingestAuthorized: status === "active",
      deviceBinding,
      profileHandle: profile?.handle ?? null,
      deviceName: collector.name,
      platform: collector.platform ?? null,
      cliVersion: collector.cliVersion ?? null,
      createdAt: collector.createdAt,
      lastSeenAt: collector.lastSeenAt ?? null,
      lastSuccessAt: collector.lastSuccessAt ?? null,
      lastFailureAt: collector.lastFailureAt ?? null,
      lastFailureCode: collector.lastFailureCode ?? null,
    };
  },
});

export const current = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const reference = accessReference(identity);
    const user = await userForIdentity(ctx, reference.identityKey) ?? await userForIdentity(ctx, reference.subject);
    const access = user ? await workspaceAccessForUser(ctx, user._id, reference) : null;
    const profile = access?.profile ?? null;
    const collectors = profile && access && user
      ? await (hasWorkspacePermission(access, reference, "collectors:manage")
        ? ctx.db.query("collectors").withIndex("by_workspaceId", (q) => q.eq("workspaceId", profile.workspaceId))
        : ctx.db.query("collectors").withIndex("by_workspaceId_and_ownerUserId", (q) => q.eq("workspaceId", profile.workspaceId).eq("ownerUserId", user._id))).order("desc").take(20)
      : [];
    const stats = profile
      ? await ctx.db.query("profileStats").withIndex("by_profileId", (q) => q.eq("profileId", profile._id)).unique()
      : null;
    const latestDeletion = user
      ? await ctx.db.query("accountDeletionRequests").withIndex("by_userId_and_requestedAt", (q) => q.eq("userId", user._id)).order("desc").first()
      : null;
    const activeDeletion = latestDeletion && latestDeletion.workspaceId === access?.workspace._id && !latestDeletion.cancelledAt && !latestDeletion.completedAt
      ? latestDeletion
      : null;
    const deletionBilling = activeDeletion
      ? (await ctx.db.query("workspaceBilling").withIndex("by_workspaceId", (q) => q.eq("workspaceId", activeDeletion.workspaceId)).take(1))[0] ?? null
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
      workspace: access ? {
        name: access.workspace.name,
        slug: access.workspace.slug,
        plan: access.workspace.plan,
        kind: access.workspace.workosOrganizationId ? "organization" as const : "personal" as const,
        role: access.membership.role,
      } : null,
      capabilities: access ? Object.fromEntries(WORKSPACE_PERMISSIONS.map((permission) => [
        permission,
        hasWorkspacePermission(access, reference, permission),
      ])) : {},
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
        .map(collectorView),
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
      deletionRequest: activeDeletion
        ? {
            requestedAt: activeDeletion.requestedAt,
            scheduledFor: activeDeletion.scheduledFor,
            waitingForBillingCancellation: activeDeletion.stage === "workspaceBilling" && Boolean(
              deletionBilling && needsBillingCancellation(deletionBilling),
            ),
            billingCancellationConfirmed: activeDeletion.stage === "workspaceBilling" && Boolean(
              !deletionBilling || !needsBillingCancellation(deletionBilling),
            ),
            billingPortalAvailable: Boolean(deletionBilling?.stripeCustomerId),
          }
        : null,
    };
  },
});

export const listCollectors = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const access = await requireWorkspaceMembership(ctx);
    const result = await (hasWorkspacePermission(access, access.reference, "collectors:manage")
      ? ctx.db.query("collectors").withIndex("by_workspaceId", (q) => q.eq("workspaceId", access.workspace._id))
      : ctx.db.query("collectors").withIndex("by_workspaceId_and_ownerUserId", (q) => q.eq("workspaceId", access.workspace._id).eq("ownerUserId", access.user._id))).order("desc").paginate(args.paginationOpts);
    return { ...result, page: result.page.map(collectorView) };
  },
});

export const writeDeviceLink = internalMutation({
  args: {
    access: accessReferenceValidator,
    codeHash: v.string(),
    codePrefix: v.string(),
    deviceName: v.string(),
    now: v.number(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const { user, profile } = await requireWorkspaceAccessForReference(ctx, args.access, "collectors:self");
    const links = await ctx.db
      .query("deviceLinkCodes")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", profile.workspaceId))
      .take(20);
    if (links.filter((link) => !link.usedAt && link.expiresAt > args.now).length >= 3) {
      throw new ConvexError("LINK_CODE_LIMIT_REACHED");
    }
    const linkId = await ctx.db.insert("deviceLinkCodes", {
      workspaceId: profile.workspaceId,
      profileId: profile._id,
      userId: user._id,
      codeHash: args.codeHash,
      codePrefix: args.codePrefix,
      deviceName: cleanText(args.deviceName, "My computer", 80),
      createdAt: args.now,
      expiresAt: args.expiresAt,
    });
    await audit(ctx, profile.workspaceId, user._id, "collector.link_issued", "device_link", String(linkId), "Issued a short-lived device link");
    return linkId;
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
      access: accessReference(identity),
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
    name: v.optional(v.string()),
    nameIsExplicit: v.optional(v.boolean()),
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
    const member = await ctx.db.query("workspaceMemberships").withIndex("by_userId_and_workspaceId", (q) => q.eq("userId", link.userId).eq("workspaceId", link.workspaceId)).unique();
    if (!profile || !workspace || workspace.accessDisabledAt || member?.status !== "active" || profile.workspaceId !== workspace._id) throw new ConvexError("INVALID_LINK_CODE");
    const limit = collectorLimit(workspace.plan);
    const collectors = await ctx.db
      .query("collectors")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", link.workspaceId))
      .take(limit + 1);
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
    if (workspace.workosOrganizationId && existing?.ownerUserId && existing.ownerUserId !== link.userId) throw new ConvexError("INSTALLATION_OWNED_BY_ANOTHER_MEMBER");
    if (workspace.workosOrganizationId && existing && !existing.ownerUserId && !["owner", "admin"].includes(member.role)) throw new ConvexError("ADMIN_MUST_CLAIM_LEGACY_INSTALLATION");
    if (!existing && collectors.filter((collector) => !collector.revokedAt).length >= limit) {
      throw new ConvexError("COLLECTOR_LIMIT_REACHED");
    }
    const update = {
      ownerUserId: link.userId,
      name: resolveDeviceName({
        linkName: cleanText(link.deviceName, "My computer", 80),
        requestedName: typeof args.name === "string" ? cleanText(args.name, "", 80) : undefined,
        platform: args.platform,
        explicit: args.nameIsExplicit,
      }),
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
    await audit(ctx, link.workspaceId, link.userId, existing ? "collector.relinked" : "collector.linked", "collector", String(collectorId), existing ? "Relinked an existing installation" : "Linked a new installation");
    return { collectorId, handle: profile.handle, deviceName: update.name };
  },
});

export const writeCollector = internalMutation({
  args: {
    access: accessReferenceValidator,
    name: v.optional(v.string()),
    keyHash: v.string(),
    keyPrefix: v.string(),
    collectorId: v.optional(v.id("collectors")),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspaceAccessForReference(ctx, args.access, "collectors:self");
    const { user, profile, workspace } = access;

    if (args.collectorId) {
      const collector = await ctx.db.get(args.collectorId);
      if (!collector || collector.workspaceId !== profile.workspaceId || collector.revokedAt) {
        throw new ConvexError("COLLECTOR_NOT_FOUND");
      }
      if (!hasWorkspacePermission(access, args.access, "collectors:manage") && collector.ownerUserId !== user._id) throw new ConvexError("FORBIDDEN");
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
      await audit(ctx, profile.workspaceId, user._id, "collector.rotated", "collector", String(collector._id), `Rotated ${collector.name}`);
      return collector._id;
    }

    const limit = collectorLimit(workspace.plan);
    const existing = await ctx.db
      .query("collectors")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", profile.workspaceId))
      .take(limit + 1);
    if (existing.filter((collector) => !collector.revokedAt).length >= limit) {
      throw new ConvexError("COLLECTOR_LIMIT_REACHED");
    }
    const collectorId = await ctx.db.insert("collectors", {
      workspaceId: profile.workspaceId,
      profileId: profile._id,
      ownerUserId: user._id,
      name: args.name ?? "My computer",
      keyHash: args.keyHash,
      keyPrefix: args.keyPrefix,
      scopes: ["telemetry:write", "outcomes:write"],
      createdAt: args.now,
    });
    await audit(ctx, profile.workspaceId, user._id, "collector.created", "collector", String(collectorId), `Created ${args.name ?? "My computer"}`);
    return collectorId;
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
      access: accessReference(identity),
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
      access: accessReference(identity),
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
    const { user, profile, collector } = await requireOwnCollectorAccess(ctx, args.collectorId);
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

export const revokeAllCollectors = mutation({
  args: {},
  handler: async (ctx) => {
    const { user, profile } = await requireWorkspaceAccess(ctx, "collectors:manage");
    const activeCollectors = await ctx.db
      .query("collectors")
      .withIndex("by_workspaceId_and_revokedAt", (q) =>
        q.eq("workspaceId", profile.workspaceId).eq("revokedAt", undefined),
      )
      .take(501);
    if (activeCollectors.length > 500) throw new ConvexError("COLLECTOR_REVOKE_LIMIT_EXCEEDED");
    if (!activeCollectors.length) return { revoked: 0 };
    const now = Date.now();
    for (const collector of activeCollectors) await ctx.db.patch(collector._id, { revokedAt: now });
    await audit(
      ctx,
      profile.workspaceId,
      user._id,
      "collectors.revoked_all",
      "workspace",
      String(profile.workspaceId),
      `Emergency-revoked ${activeCollectors.length} active collector${activeCollectors.length === 1 ? "" : "s"}`,
    );
    return { revoked: activeCollectors.length };
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
    const reference = accessReference(identity);
    if ((await ctx.db.get(userId))?.preferPersonalWorkspace) reference.organizationId = undefined;
    const now = Date.now();
    let workspace: Doc<"workspaces"> | null = null;

    if (reference.organizationId) {
      workspace = await ctx.db.query("workspaces").withIndex("by_workosOrganizationId", (q) =>
        q.eq("workosOrganizationId", reference.organizationId),
      ).unique();
      if (workspace) {
        await syncOrganizationMembership(ctx, workspace, userId, reference, now);
        const existing = await ctx.db.query("profiles").withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspace!._id)).first();
        if (existing) return { handle: existing.handle, created: false };
        if (!referenceHasPermission(reference, "profile:manage")) throw new ConvexError("FORBIDDEN");
      } else {
        if (!referenceHasPermission(reference, "workspace:manage")) throw new ConvexError("ORGANIZATION_NOT_PROVISIONED");
        const workspaceId = await ctx.db.insert("workspaces", {
          ownerId: userId,
          workosOrganizationId: reference.organizationId,
          slug: handle,
          name: `${identity.name?.trim() || handle}'s organization`,
          plan: "team",
          isPublic: false,
          retentionDays: 365,
          createdAt: now,
        });
        workspace = await ctx.db.get(workspaceId);
        if (!workspace) throw new ConvexError("WORKSPACE_CREATE_FAILED");
        await syncOrganizationMembership(ctx, workspace, userId, reference, now);
      }
    } else {
      const existingAccess = await workspaceAccessForUser(ctx, userId, reference);
      if (existingAccess?.profile) return { handle: existingAccess.profile.handle, created: false };
    }

    const existingProfile = await ctx.db.query("profiles").withIndex("by_handle", (q) => q.eq("handle", handle)).unique();
    if (existingProfile) throw new ConvexError("PROFILE_UNAVAILABLE");
    const existingWorkspace = await ctx.db.query("workspaces").withIndex("by_slug", (q) => q.eq("slug", handle)).unique();
    if (existingWorkspace && existingWorkspace._id !== workspace?._id) throw new ConvexError("PROFILE_UNAVAILABLE");

    const displayName = identity.name?.trim() || handle;
    if (!workspace) {
      const workspaceId = await ctx.db.insert("workspaces", {
        ownerId: userId,
        slug: handle,
        name: `${displayName}'s workspace`,
        plan: "free",
        isPublic: false,
        retentionDays: 30,
        createdAt: now,
      });
      workspace = await ctx.db.get(workspaceId);
      if (!workspace) throw new ConvexError("WORKSPACE_CREATE_FAILED");
      await ctx.db.insert("workspaceMemberships", {
        workspaceId,
        userId,
        role: "owner",
        roles: ["owner"],
        permissions: [...WORKSPACE_PERMISSIONS],
        source: "personal",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
    }
    await createProfileRecords(ctx, workspace, workspace.ownerId ?? userId, userId, handle, displayName, identity.pictureUrl, now);
    return { handle, created: true };
  },
});

export const setProfileVisibility = mutation({
  args: { isPublic: v.boolean() },
  handler: async (ctx, args) => {
    const { user, profile, workspace } = await requireWorkspaceAccess(ctx, "profile:manage");
    if (args.isPublic && workspace.workosOrganizationId) throw new ConvexError("COMPANY_DATA_IS_PRIVATE");
    await ctx.db.patch(profile._id, { isPublic: args.isPublic, updatedAt: Date.now() });
    await ctx.db.patch(profile.workspaceId, { isPublic: args.isPublic });
    const entries = await ctx.db
      .query("leaderboardEntries")
      .withIndex("by_profileId_and_period_and_metric", (q) => q.eq("profileId", profile._id))
      .take(10);
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
    const reference = accessReference(identity);
    const user = await userForIdentity(ctx, reference.identityKey) ?? await userForIdentity(ctx, reference.subject);
    const access = user ? await workspaceAccessForUser(ctx, user._id, reference) : null;
    const link = await ctx.db.get(args.linkId);
    if (!user || !access || !link || link.userId !== user._id || link.workspaceId !== access.workspace._id) return null;
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
    const { user, profile } = await requireWorkspaceAccess(ctx, "profile:manage");
    const displayName = cleanText(args.displayName, "", 80);
    const bio = cleanText(args.bio, "", 280);
    if (!displayName) throw new ConvexError("DISPLAY_NAME_REQUIRED");
    const now = Date.now();
    await ctx.db.patch(profile._id, { displayName, bio, updatedAt: now });
    const entries = await ctx.db.query("leaderboardEntries").withIndex("by_profileId_and_period_and_metric", (q) => q.eq("profileId", profile._id)).take(10);
    for (const entry of entries) await ctx.db.patch(entry._id, { displayName, updatedAt: now });
    await audit(ctx, profile.workspaceId, user._id, "profile.updated", "profile", String(profile._id), "Updated profile details");
    return { displayName, bio };
  },
});

export const renameCollector = mutation({
  args: { collectorId: v.id("collectors"), name: v.string() },
  handler: async (ctx, args) => {
    const { user, profile, collector } = await requireOwnCollectorAccess(ctx, args.collectorId);
    if (!profile || !collector || collector.workspaceId !== profile.workspaceId) throw new ConvexError("COLLECTOR_NOT_FOUND");
    const name = cleanText(args.name, "", 80);
    if (!name) throw new ConvexError("COLLECTOR_NAME_REQUIRED");
    await ctx.db.patch(collector._id, { name });
    await audit(ctx, profile.workspaceId, user._id, "collector.renamed", "collector", String(collector._id), `Renamed collector to ${name}`);
    return { collectorId: collector._id, name };
  },
});

async function buildAccountExport(ctx: QueryCtx, user: Doc<"users">, profile: Doc<"profiles">) {
  const [workspace, stats, collectors, daily, models, auditLog, telemetry, agents, outcomes] = await Promise.all([
    ctx.db.get(profile.workspaceId),
    ctx.db.query("profileStats").withIndex("by_profileId", (q) => q.eq("profileId", profile._id)).unique(),
    ctx.db.query("collectors").withIndex("by_workspaceId", (q) => q.eq("workspaceId", profile.workspaceId)).take(5001),
    ctx.db.query("profileDailyTotals").withIndex("by_profileId_and_day", (q) => q.eq("profileId", profile._id)).order("desc").take(730),
    ctx.db.query("modelTotals").withIndex("by_profileId_and_totalTokens", (q) => q.eq("profileId", profile._id)).order("desc").take(500),
    ctx.db.query("auditEvents").withIndex("by_workspaceId_and_createdAt", (q) => q.eq("workspaceId", profile.workspaceId)).order("desc").take(500),
    ctx.db.query("telemetryEvents").withIndex("by_profileId_and_occurredAt", (q) => q.eq("profileId", profile._id)).order("desc").take(201),
    ctx.db.query("agentLiveStats").withIndex("by_profileId_and_updatedAt", (q) => q.eq("profileId", profile._id)).order("desc").take(201),
    ctx.db.query("outcomes").withIndex("by_profileId_and_occurredAt", (q) => q.eq("profileId", profile._id)).order("desc").take(201),
  ]);
  if (collectors.length > 5000) throw new ConvexError("ACCOUNT_EXPORT_TOO_LARGE");
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
    recentDetail: {
      telemetry: telemetry.slice(0, 200).map((event) => ({
        eventKey: event.eventKey,
        logicalRequestId: event.logicalRequestId,
        sessionId: event.sessionId,
        agentName: event.agentName,
        eventType: event.eventType,
        source: event.source,
        provider: event.provider,
        model: event.model,
        totalTokens: event.totalTokens,
        costMicros: event.costMicros,
        latencyMs: event.latencyMs,
        status: event.status,
        state: event.state,
        task: event.task,
        traceId: event.traceId,
        spanId: event.spanId,
        occurredAt: event.occurredAt,
        receivedAt: event.receivedAt,
      })),
      agents: agents.slice(0, 200).map((agent) => ({
        externalId: agent.externalId,
        parentExternalId: agent.parentExternalId,
        name: agent.name,
        model: agent.model,
        state: agent.state,
        task: agent.task,
        totalTokens: agent.totalTokens,
        toolCalls: agent.toolCalls,
        errorCount: agent.errorCount,
        sessionStartedAt: agent.sessionStartedAt,
        updatedAt: agent.updatedAt,
        expiresAt: agent.expiresAt,
      })),
      outcomes: outcomes.slice(0, 200).map((outcome) => ({
        eventKey: outcome.eventKey,
        logicalRequestId: outcome.logicalRequestId,
        outcome: outcome.outcome,
        occurredAt: outcome.occurredAt,
        createdAt: outcome.createdAt,
      })),
      limits: {
        telemetry: 200,
        agents: 200,
        outcomes: 200,
        telemetryTruncated: telemetry.length > 200,
        agentsTruncated: agents.length > 200,
        outcomesTruncated: outcomes.length > 200,
      },
    },
    limits: { dailyDays: 730, models: 500, auditEvents: 500 },
  };
}

type AccountExport = Awaited<ReturnType<typeof buildAccountExport>>;

export const readAccountExport = internalQuery({
  args: { access: accessReferenceValidator },
  handler: async (ctx, args): Promise<AccountExport> => {
    const { user, profile } = await requireWorkspaceAccessForReference(ctx, args.access, "data:export");
    await requireWorkspaceAccessForReference(ctx, args.access, "finance:read");
    return await buildAccountExport(ctx, user, profile);
  },
});

export const recordAccountExport = internalMutation({
  args: { access: accessReferenceValidator },
  handler: async (ctx, args) => {
    const { user, profile } = await requireWorkspaceAccessForReference(ctx, args.access, "data:export");
    await audit(ctx, profile.workspaceId, user._id, "workspace.exported", "workspace", String(profile.workspaceId), "Downloaded workspace data export");
  },
});

export const exportAccount = action({
  args: {},
  handler: async (ctx): Promise<AccountExport> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("AUTH_REQUIRED");
    const access = accessReference(identity);
    const data: AccountExport = await ctx.runQuery(internal.account.readAccountExport, { access });
    await ctx.runMutation(internal.account.recordAccountExport, { access });
    return data;
  },
});

export const auditLog = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccess(ctx, "audit:read");
    const result = await ctx.db.query("auditEvents").withIndex("by_workspaceId_and_createdAt", (q) =>
      q.eq("workspaceId", workspace._id),
    ).order("desc").paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map((event) => ({
        id: event._id,
        actorUserId: event.actorUserId,
        action: event.action,
        targetType: event.targetType,
        targetId: event.targetId,
        summary: event.summary,
        createdAt: event.createdAt,
      })),
    };
  },
});

export const requestAccountDeletion = mutation({
  args: { confirmation: v.string() },
  handler: async (ctx, args) => {
    if (args.confirmation.trim().toLowerCase() !== "delete my account") throw new ConvexError("CONFIRMATION_REQUIRED");
    const { user, profile, workspace } = await requireWorkspaceAccess(ctx, "workspace:delete");
    if (workspace.workosOrganizationId) throw new ConvexError("PERSONAL_WORKSPACE_ONLY");
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
    const collectors = await ctx.db.query("collectors").withIndex("by_workspaceId", (q) => q.eq("workspaceId", profile.workspaceId)).take(5001);
    if (collectors.length > 5000) throw new ConvexError("COLLECTOR_LIMIT_EXCEEDED");
    for (const collector of collectors) if (!collector.revokedAt) await ctx.db.patch(collector._id, { revokedAt: now });
    await audit(ctx, profile.workspaceId, user._id, "account.deletion_requested", "workspace", String(profile.workspaceId), "Requested account deletion with seven-day recovery window");
    await ctx.scheduler.runAt(scheduledFor, internal.account.processAccountDeletion, { requestId });
    return { scheduledFor, replay: false };
  },
});

export const cancelAccountDeletion = mutation({
  args: {},
  handler: async (ctx) => {
    const { user, workspace } = await requireWorkspaceAccess(ctx, "workspace:delete");
    if (workspace.workosOrganizationId) throw new ConvexError("PERSONAL_WORKSPACE_ONLY");
    const request = await ctx.db.query("accountDeletionRequests").withIndex("by_userId_and_requestedAt", (q) => q.eq("userId", user._id)).order("desc").first();
    if (!request || request.cancelledAt || request.completedAt) return { cancelled: false };
    const now = Date.now();
    await ctx.db.patch(request._id, { cancelledAt: now });
    const collectors = await ctx.db.query("collectors").withIndex("by_workspaceId", (q) => q.eq("workspaceId", request.workspaceId)).take(5001);
    if (collectors.length > 5000) throw new ConvexError("COLLECTOR_LIMIT_EXCEEDED");
    for (const collector of collectors) {
      if (collector.revokedAt === request.requestedAt) await ctx.db.patch(collector._id, { revokedAt: undefined });
    }
    await audit(ctx, request.workspaceId, user._id, "account.deletion_cancelled", "workspace", String(request.workspaceId), "Cancelled account deletion");
    return { cancelled: true };
  },
});

function needsBillingCancellation(billing: Doc<"workspaceBilling">) {
  return billing.status !== "canceled" &&
    (billing.status !== "inactive" || Boolean(billing.stripeSubscriptionId));
}

const deletionStages = [
  "privacy", "workspaceBilling", "billingEvents", "leaderboard", "telemetry", "outcomes", "agents", "dailyUsage",
  "dailyTotals", "dimensions", "devices", "models", "snapshots",
  "collectorSessions", "ingestReceipts", "rateBuckets", "sessionReceipts",
  "snapshotRuns", "snapshotReceipts", "snapshotChunkGroups", "snapshotPartitionHeads", "deviceLinks", "collectors", "stats",
  "productData", "audits", "memberships", "profile", "workspace", "user", "complete",
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
    const collectors = async () => {
      const rows = await ctx.db.query("collectors").withIndex("by_workspaceId", (q) => q.eq("workspaceId", request.workspaceId)).take(5001);
      if (rows.length > 5000) throw new ConvexError("COLLECTOR_LIMIT_EXCEEDED");
      return rows;
    };

    if (stage === "workspaceBilling") {
      const rows = await ctx.db.query("workspaceBilling")
        .withIndex("by_workspaceId", (q) => q.eq("workspaceId", request.workspaceId))
        .take(100);
      const activeSubscription = rows.some(needsBillingCancellation);
      if (activeSubscription) {
        // Never erase the only local reference to a billable Stripe subscription.
        // Keep deletion resumable and retry after Stripe reports cancellation; no
        // external Stripe mutation is performed by account deletion.
        await ctx.scheduler.runAfter(24 * 60 * 60 * 1000, internal.account.processAccountDeletion, { requestId });
        return { processed: false, stage, rows: 0, waitingForSubscriptionCancellation: true };
      }
      return finishRows(rows);
    }
    if (stage === "billingEvents") {
      const rows = await ctx.db.query("billingEvents")
        .withIndex("by_workspaceId_and_createdAt", (q) => q.eq("workspaceId", request.workspaceId))
        .take(100);
      if (rows.length) {
        for (const row of rows) await ctx.db.patch(row._id, { workspaceId: undefined });
        const processed = (request.processedRows ?? 0) + rows.length;
        await repeatDeletion(ctx, requestId, processed);
        return { processed: true, stage, rows: rows.length };
      }
      await advanceDeletion(ctx, requestId, stage, request.processedRows ?? 0);
      return { processed: true, stage, rows: 0 };
    }

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

    if (["ingestReceipts", "rateBuckets", "sessionReceipts", "snapshotRuns", "snapshotReceipts", "snapshotChunkGroups", "snapshotPartitionHeads"].includes(stage)) {
      for (const collector of await collectors()) {
        const rows = stage === "ingestReceipts"
          ? await ctx.db.query("ingestReceipts").withIndex("by_collectorId_and_batchId", (q) => q.eq("collectorId", collector._id)).take(100)
          : stage === "rateBuckets"
            ? await ctx.db.query("ingestRateBuckets").withIndex("by_collectorId_and_bucketStart", (q) => q.eq("collectorId", collector._id)).take(100)
            : stage === "sessionReceipts"
              ? await ctx.db.query("sessionReceipts").withIndex("by_collectorId_and_source_and_sessionId", (q) => q.eq("collectorId", collector._id)).take(100)
              : stage === "snapshotRuns"
                ? await ctx.db.query("snapshotRuns").withIndex("by_collectorId_and_updatedAt", (q) => q.eq("collectorId", collector._id)).take(100)
                : stage === "snapshotChunkGroups"
                  ? await ctx.db.query("snapshotChunkGroups").withIndex("by_collectorId_and_runId_and_source_and_day", q => q.eq("collectorId", collector._id)).take(100)
                  : stage === "snapshotPartitionHeads"
                    ? await ctx.db.query("snapshotPartitionHeads").withIndex("by_collectorId_and_source_and_day", q => q.eq("collectorId", collector._id)).take(100)
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
    if (stage === "productData") {
      const teams = await ctx.db.query("teams").withIndex("by_workspaceId", q => q.eq("workspaceId", request.workspaceId)).take(100);
      if (teams.length) return finishRows(teams);
      const teamMembers = await ctx.db.query("teamMembers").withIndex("by_workspaceId_and_userId_and_leftAt", q => q.eq("workspaceId", request.workspaceId)).take(100);
      if (teamMembers.length) return finishRows(teamMembers);
      const projects = await ctx.db.query("projects").withIndex("by_workspaceId_and_key", q => q.eq("workspaceId", request.workspaceId)).take(100);
      if (projects.length) return finishRows(projects);
      const workspaceInvitations = await ctx.db.query("workspaceInvitations").withIndex("by_workspaceId_and_state_and_email", q => q.eq("workspaceId", request.workspaceId)).take(100);
      if (workspaceInvitations.length) return finishRows(workspaceInvitations);
      const savedViews = await ctx.db.query("savedViews").withIndex("by_workspaceId_and_userId", q => q.eq("workspaceId", request.workspaceId)).take(100);
      if (savedViews.length) return finishRows(savedViews);
      const financialEntries = await ctx.db.query("financialEntries").withIndex("by_workspaceId_and_day", q => q.eq("workspaceId", request.workspaceId)).take(100);
      if (financialEntries.length) return finishRows(financialEntries);
      const financialDaily = await ctx.db.query("financialDaily").withIndex("by_workspaceId_and_day_and_currency_and_basis", q => q.eq("workspaceId", request.workspaceId)).take(100);
      if (financialDaily.length) return finishRows(financialDaily);
      const financialMonthly = await ctx.db.query("financialMonthly").withIndex("by_workspaceId_and_month_and_currency_and_basis", q => q.eq("workspaceId", request.workspaceId)).take(100);
      if (financialMonthly.length) return finishRows(financialMonthly);
      const budgets = await ctx.db.query("budgets").withIndex("by_workspaceId", q => q.eq("workspaceId", request.workspaceId)).take(100);
      if (budgets.length) return finishRows(budgets);
      const notifications = await ctx.db.query("notifications").withIndex("by_workspaceId_and_userId_and_createdAt", q => q.eq("workspaceId", request.workspaceId)).take(100);
      if (notifications.length) return finishRows(notifications);
      const savingsActions = await ctx.db.query("savingsActions").withIndex("by_workspaceId_and_state", q => q.eq("workspaceId", request.workspaceId)).take(100);
      if (savingsActions.length) return finishRows(savingsActions);
      const providerConnections = await ctx.db.query("providerConnections").withIndex("by_workspaceId", q => q.eq("workspaceId", request.workspaceId)).take(100);
      if (providerConnections.length) return finishRows(providerConnections);
      const providerDailyUsage = await ctx.db.query("providerDailyUsage").withIndex("by_workspaceId_and_day", q => q.eq("workspaceId", request.workspaceId)).take(100);
      if (providerDailyUsage.length) return finishRows(providerDailyUsage);
      const providerMappings = await ctx.db.query("providerIdentityMappings").withIndex("by_workspaceId", q => q.eq("workspaceId", request.workspaceId)).take(100);
      if (providerMappings.length) return finishRows(providerMappings);
      await advanceDeletion(ctx, requestId, stage, request.processedRows ?? 0);
      return { processed: true, stage, rows: 0 };
    }
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
      if (user && !remainingMembership && !remainingWorkspace) {
        const preferences = await ctx.db.query("preferences").withIndex("by_userId", q => q.eq("userId", user._id)).take(100);
        const operations = await ctx.db.query("organizationOperations").withIndex("by_userId_and_requestId", q => q.eq("userId", user._id)).take(100);
        if (preferences.length) return finishRows(preferences);
        if (operations.length) return finishRows(operations);
        await ctx.db.delete(user._id);
      }
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
