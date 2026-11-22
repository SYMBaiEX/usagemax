import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";

import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { accessReference, accessReferenceValidator, audit, hasWorkspacePermission, requireWorkspaceAccess, requireWorkspaceAccessForReference, requireWorkspaceMembership } from "./account";
import { gatewayScope } from "./gatewayContract";
import type { GatewayScope } from "./gatewayContract";
import { cleanText, sha256 } from "./lib";

const ACTIVE_KEYS_PER_PROJECT = 50;
const KEY_LIST_LIMIT = 100;
const limit = new RateLimiter(components.rateLimiter, {
  gatewayIngest: { kind: "token bucket", rate: 240, period: MINUTE, capacity: 480 },
  gatewayReport: { kind: "token bucket", rate: 120, period: MINUTE, capacity: 240 },
});

export async function activeGatewayProject(ctx: QueryCtx | MutationCtx, projectId: Id<"projects">, workspaceId: Id<"workspaces">) {
  const project = await ctx.db.get("projects", projectId);
  if (!project || project.workspaceId !== workspaceId || project.archivedAt !== undefined) return null;
  const workspace = await ctx.db.get("workspaces", workspaceId);
  if (!workspace || workspace.accessDisabledAt !== undefined) return null;
  if (!workspace.workosOrganizationId && workspace.ownerId) {
    const deletion = await ctx.db.query("accountDeletionRequests")
      .withIndex("by_userId_and_requestedAt", (q) => q.eq("userId", workspace.ownerId!)).order("desc").first();
    if (deletion?.workspaceId === workspaceId && deletion.cancelledAt === undefined && deletion.completedAt === undefined) return null;
  }
  return { workspace, project };
}

export async function requireGatewayProject(ctx: QueryCtx | MutationCtx, projectId: Id<"projects">, workspaceId: Id<"workspaces">) {
  const active = await activeGatewayProject(ctx, projectId, workspaceId);
  if (!active) throw new ConvexError("GATEWAY_PROJECT_NOT_FOUND");
  return active;
}

export async function authenticateGateway(ctx: QueryCtx | MutationCtx, keyHash: string, scope?: GatewayScope) {
  const credential = await ctx.db.query("gatewayCredentials")
    .withIndex("by_keyHash", (q) => q.eq("keyHash", keyHash)).unique();
  if (!credential || credential.revokedAt !== undefined) throw new ConvexError("INVALID_GATEWAY_CREDENTIAL");
  const active = await activeGatewayProject(ctx, credential.projectId, credential.workspaceId);
  if (!active) throw new ConvexError("INVALID_GATEWAY_CREDENTIAL");
  if (scope && credential.scope !== scope) throw new ConvexError("GATEWAY_SCOPE_REQUIRED");
  return { credential, workspace: active.workspace };
}

export async function consumeGatewayQuota(ctx: MutationCtx, id: Id<"gatewayCredentials">, scope: GatewayScope) {
  const result = await limit.limit(ctx, scope === "ingest" ? "gatewayIngest" : "gatewayReport", { key: id });
  if (!result.ok) throw new ConvexError({ code: "GATEWAY_RATE_LIMITED", retryAfter: Math.max(1, Math.ceil(result.retryAfter / 1000)) });
}

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return "umxg_" + Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const issued = v.object({ credentialId: v.id("gatewayCredentials"), token: v.string() });
type Issued = typeof issued.type;

export const issue = action({
  args: { projectId: v.id("projects"), name: v.string(), scope: gatewayScope },
  returns: issued,
  handler: async (ctx, args): Promise<Issued> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("AUTH_REQUIRED");
    const name = cleanText(args.name, "", 80);
    if (!name) throw new ConvexError("GATEWAY_NAME_REQUIRED");
    const token = newToken();
    const credentialId: Id<"gatewayCredentials"> = await ctx.runMutation(internal.gatewayCredentials.create, {
      ...args, name, access: accessReference(identity),
      keyHash: await sha256(token), keyPrefix: token.slice(0, 13),
    });
    return { credentialId, token };
  },
});

export const create = internalMutation({
  args: { projectId: v.id("projects"), name: v.string(), scope: gatewayScope, access: accessReferenceValidator, keyHash: v.string(), keyPrefix: v.string() },
  returns: v.id("gatewayCredentials"),
  handler: async (ctx, { access: ref, projectId, name, scope, keyHash, keyPrefix }) => {
    const access = await requireWorkspaceAccessForReference(ctx, ref, "collectors:manage");
    if (scope === "report" && !hasWorkspacePermission(access, ref, "finance:read")) throw new ConvexError("FORBIDDEN");
    const { workspace } = await requireGatewayProject(ctx, projectId, access.workspace._id);
    const active = await ctx.db.query("gatewayCredentials")
      .withIndex("by_projectId_and_revokedAt", (q) => q.eq("projectId", projectId).eq("revokedAt", undefined))
      .take(ACTIVE_KEYS_PER_PROJECT);
    if (active.length >= ACTIVE_KEYS_PER_PROJECT) throw new ConvexError("GATEWAY_CREDENTIAL_LIMIT_REACHED");
    const id = await ctx.db.insert("gatewayCredentials", { workspaceId: workspace._id, projectId, name, scope, keyHash, keyPrefix, createdAt: Date.now() });
    await audit(ctx, workspace._id, access.user._id, "gateway.credential_issued", "gatewayCredential", id, "Issued a project gateway credential");
    return id;
  },
});

export const rotate = action({
  args: { credentialId: v.id("gatewayCredentials") },
  returns: issued,
  handler: async (ctx, args): Promise<Issued> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("AUTH_REQUIRED");
    const token = newToken();
    await ctx.runMutation(internal.gatewayCredentials.replaceKey, {
      ...args, access: accessReference(identity), keyHash: await sha256(token), keyPrefix: token.slice(0, 13),
    });
    return { credentialId: args.credentialId, token };
  },
});

export const replaceKey = internalMutation({
  args: { credentialId: v.id("gatewayCredentials"), access: accessReferenceValidator, keyHash: v.string(), keyPrefix: v.string() },
  returns: v.null(),
  handler: async (ctx, { access: ref, credentialId, keyHash, keyPrefix }) => {
    const access = await requireWorkspaceAccessForReference(ctx, ref, "collectors:manage");
    const credential = await ctx.db.get("gatewayCredentials", credentialId);
    if (credential?.workspaceId !== access.workspace._id || credential.revokedAt !== undefined) throw new ConvexError("GATEWAY_CREDENTIAL_NOT_FOUND");
    if (credential.scope === "report" && !hasWorkspacePermission(access, ref, "finance:read")) throw new ConvexError("FORBIDDEN");
    await requireGatewayProject(ctx, credential.projectId, access.workspace._id);
    await ctx.db.patch("gatewayCredentials", credentialId, { keyHash, keyPrefix, rotatedAt: Date.now(), lastSuccessAt: undefined });
    await audit(ctx, access.workspace._id, access.user._id, "gateway.credential_rotated", "gatewayCredential", credentialId, "Rotated a project gateway credential");
    return null;
  },
});

export const revoke = mutation({
  args: { credentialId: v.id("gatewayCredentials") },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, { credentialId }) => {
    const access = await requireWorkspaceAccess(ctx, "collectors:manage");
    const credential = await ctx.db.get("gatewayCredentials", credentialId);
    if (credential?.workspaceId !== access.workspace._id) throw new ConvexError("GATEWAY_CREDENTIAL_NOT_FOUND");
    if (credential.scope === "report" && !hasWorkspacePermission(access, access.reference, "finance:read")) throw new ConvexError("FORBIDDEN");
    if (credential.revokedAt === undefined) {
      await ctx.db.patch("gatewayCredentials", credentialId, { revokedAt: Date.now() });
      await audit(ctx, access.workspace._id, access.user._id, "gateway.credential_revoked", "gatewayCredential", credentialId, "Revoked a project gateway credential");
    }
    return { ok: true as const };
  },
});

async function requireGatewayWorkspace(ctx: QueryCtx) {
  const access = await requireWorkspaceMembership(ctx);
  if (!hasWorkspacePermission(access, access.reference, "collectors:manage")
    && !hasWorkspacePermission(access, access.reference, "finance:read")) throw new ConvexError("FORBIDDEN");
  return access;
}

export const project = query({
  args: { projectId: v.string() },
  returns: v.union(v.object({ _id: v.id("projects"), name: v.string(), key: v.string() }), v.null()),
  handler: async (ctx, { projectId }) => {
    const access = await requireGatewayWorkspace(ctx);
    const id = ctx.db.normalizeId("projects", projectId);
    if (!id) return null;
    const active = await activeGatewayProject(ctx, id, access.workspace._id);
    if (!active) return null;
    const { _id, name, key } = active.project;
    return { _id, name, key };
  },
});

export const projects = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.object({
    _id: v.id("projects"), name: v.string(), key: v.string(), archivedAt: v.optional(v.number()),
  })),
  handler: async (ctx, { paginationOpts }) => {
    const access = await requireGatewayWorkspace(ctx);
    if (!Number.isInteger(paginationOpts.numItems) || paginationOpts.numItems < 1 || paginationOpts.numItems > 100)
      throw new ConvexError("INVALID_GATEWAY_LIMIT");
    const page = await ctx.db.query("projects")
      .withIndex("by_workspaceId_and_key", (q) => q.eq("workspaceId", access.workspace._id)).paginate(paginationOpts);
    return { ...page, page: page.page.map(({ _id, name, key, archivedAt }) => ({ _id, name, key, archivedAt })) };
  },
});

export const list = query({
  args: { projectId: v.id("projects") },
  returns: v.object({
    credentials: v.array(v.object({
      _id: v.id("gatewayCredentials"), name: v.string(), scope: gatewayScope, keyPrefix: v.string(),
      createdAt: v.number(), lastSuccessAt: v.union(v.number(), v.null()), revokedAt: v.union(v.number(), v.null()),
    })),
    truncated: v.boolean(),
  }),
  handler: async (ctx, { projectId }) => {
    const access = await requireWorkspaceAccess(ctx, "collectors:manage");
    await requireGatewayProject(ctx, projectId, access.workspace._id);
    const canViewReport = hasWorkspacePermission(access, access.reference, "finance:read");
    const rows = await ctx.db.query("gatewayCredentials")
      .withIndex("by_projectId", (q) => q.eq("projectId", projectId)).order("desc").take(KEY_LIST_LIMIT + 1);
    const credentials = rows.slice(0, KEY_LIST_LIMIT).filter((row) => canViewReport || row.scope === "ingest")
      .map(({ _id, name, scope, keyPrefix, createdAt, lastSuccessAt, revokedAt }) =>
        ({ _id, name, scope, keyPrefix, createdAt, lastSuccessAt: lastSuccessAt ?? null, revokedAt: revokedAt ?? null }));
    return { credentials, truncated: rows.length > KEY_LIST_LIMIT };
  },
});

export const status = internalQuery({
  args: { keyHash: v.string() },
  returns: v.object({ ok: v.literal(true), scope: gatewayScope, lastSuccessAt: v.union(v.number(), v.null()) }),
  handler: async (ctx, { keyHash }) => {
    const { credential } = await authenticateGateway(ctx, keyHash);
    return { ok: true as const, scope: credential.scope, lastSuccessAt: credential.lastSuccessAt ?? null };
  },
});
