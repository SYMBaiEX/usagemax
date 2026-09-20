import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  accessReference,
  accessReferenceValidator,
  audit,
  createProfileRecords,
  hasWorkspacePermission,
  requireWorkspaceAccess,
  requireWorkspaceAccessForReference,
  requireWorkspaceMembership,
  syncOrganizationMembership,
  upsertUser,
  userForIdentity,
  WORKSPACE_PERMISSIONS,
} from "./account";
import { cleanText } from "./lib";
import { memberRole, productPolicy } from "./productPolicy";

export async function requireEnterprise(
  ctx: QueryCtx | MutationCtx,
  permission:
    | "finance:read"
    | "finance:manage"
    | "integrations:manage"
    | "workspace:manage",
) {
  const access = await requireWorkspaceAccess(ctx, permission);
  if (!productPolicy(access.workspace.plan).enterprise)
    throw new ConvexError("ENTERPRISE_REQUIRED");
  return access;
}

export const bootstrap = mutation({
  args: {},
  handler: async (ctx) => {
    const { identity, userId } = await upsertUser(ctx);
    const reference = accessReference(identity);
    if (!reference.organizationId) return null;
    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_workosOrganizationId", (q) =>
        q.eq("workosOrganizationId", reference.organizationId),
      )
      .unique();
    if (!workspace || workspace.accessDisabledAt)
      throw new ConvexError("ORGANIZATION_NOT_PROVISIONED");
    await syncOrganizationMembership(
      ctx,
      workspace,
      userId,
      reference,
      Date.now(),
    );
    // Invitations never grant local access: only the verified organization JWT does.
    if (identity.email) {
      // WorkOS reconciliation may observe acceptance before this first login.
      // Consume onboarding separately, once, so a later login cannot undo removal.
      const invites = (
        await Promise.all(
          (["pending", "accepted"] as const).map((state) =>
            ctx.db
              .query("workspaceInvitations")
              .withIndex("by_onboarding", (q) =>
                q
                  .eq("workspaceId", workspace._id)
                  .eq("email", identity.email!.toLowerCase())
                  .eq("onboardingAppliedAt", undefined)
                  .eq("state", state),
              )
              .take(10),
          ),
        )
      ).flat();
      for (const invite of invites) {
        if (invite.state === "pending" && invite.expiresAt < Date.now())
          continue;
        await ctx.db.patch(invite._id, {
          state: "accepted",
          onboardingAppliedAt: Date.now(),
          updatedAt: Date.now(),
        });
        if (invite.teamId) {
          const team = await ctx.db.get(invite.teamId);
          if (team?.workspaceId === workspace._id && !team.archivedAt) {
            const existing = await ctx.db
              .query("teamMembers")
              .withIndex("by_teamId_and_userId_and_leftAt", (q) =>
                q
                  .eq("teamId", team._id)
                  .eq("userId", userId)
                  .eq("leftAt", undefined),
              )
              .unique();
            if (!existing)
              await addTeamMember(ctx, workspace._id, team._id, userId, false);
          }
        }
      }
    }
    return workspace._id;
  },
});

// Selection can only opt into this authenticated user's own personal workspace.
// Selecting a company still requires a WorkOS JWT for that exact organization.
export const selectPersonal = mutation({
  args: { personal: v.boolean() },
  handler: async (ctx, args) => {
    const { userId } = await upsertUser(ctx);
    await ctx.db.patch(userId, { preferPersonalWorkspace: args.personal });
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user =
      (await userForIdentity(ctx, identity.tokenIdentifier)) ??
      (await userForIdentity(ctx, identity.subject));
    if (!user) return [];
    const memberships = await ctx.db
      .query("workspaceMemberships")
      .withIndex("by_userId_and_workspaceId", (q) => q.eq("userId", user._id))
      .take(100);
    const result = await Promise.all(
      memberships
        .filter((m) => m.status === "active")
        .map(async (member) => {
          const workspace = await ctx.db.get(member.workspaceId);
          return workspace && !workspace.accessDisabledAt
            ? {
                id: workspace._id,
                name: workspace.name,
                organizationId: workspace.workosOrganizationId ?? null,
                role: member.role,
                tier: productPolicy(workspace.plan).tier,
              }
            : null;
        }),
    );
    return result.filter((item) => item !== null);
  },
});

export const overview = query({
  args: {},
  handler: async (ctx) => {
    const access = await requireWorkspaceMembership(ctx);
    const { workspace, user, reference } = access;
    const canManage = hasWorkspacePermission(
      access,
      reference,
      "members:manage",
    );
    const ownTeams = await ctx.db
      .query("teamMembers")
      .withIndex("by_workspaceId_and_userId_and_leftAt", (q) =>
        q
          .eq("workspaceId", workspace._id)
          .eq("userId", user._id)
          .eq("leftAt", undefined),
      )
      .take(100);
    const teamRows = canManage
      ? await ctx.db
          .query("teams")
          .withIndex("by_workspaceId", (q) =>
            q.eq("workspaceId", workspace._id),
          )
          .take(501)
      : (await Promise.all(ownTeams.map((m) => ctx.db.get(m.teamId)))).filter(
          (x) => x !== null,
        );
    const projects =
      canManage || hasWorkspacePermission(access, reference, "finance:read")
        ? await ctx.db
            .query("projects")
            .withIndex("by_workspaceId_and_key", (q) =>
              q.eq("workspaceId", workspace._id),
            )
            .take(201)
        : [];
    const billing = hasWorkspacePermission(access, reference, "billing:read")
      ? (
          await ctx.db
            .query("workspaceBilling")
            .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspace._id))
            .take(1)
        )[0]
      : undefined;
    return {
      workspace: {
        id: workspace._id,
        name: workspace.name,
        organizationId: workspace.workosOrganizationId ?? null,
        retentionDays: workspace.retentionDays,
      },
      userId: user._id,
      policy: productPolicy(workspace.plan),
      capabilities: Object.fromEntries(
        WORKSPACE_PERMISSIONS.map((permission) => [
          permission,
          hasWorkspacePermission(access, reference, permission),
        ]),
      ),
      teams: teamRows.slice(0, 500),
      projects: projects.slice(0, 200),
      billing: billing
        ? {
            tier: billing.tier,
            status: billing.status,
            seatQuantity: billing.seatQuantity ?? null,
            currentPeriodEnd: billing.currentPeriodEnd ?? null,
            cancelAtPeriodEnd: billing.cancelAtPeriodEnd ?? false,
            stripeCustomerId: billing.stripeCustomerId,
          }
        : null,
      moreTeams: teamRows.length > 500,
      moreProjects: projects.length > 200,
    };
  },
});

export const members = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccess(ctx, "members:manage");
    const rows = await ctx.db
      .query("workspaceMemberships")
      .withIndex("by_workspaceId_and_userId", (q) =>
        q.eq("workspaceId", workspace._id),
      )
      .paginate(args.paginationOpts);
    return {
      ...rows,
      page: await Promise.all(
        rows.page.map(async (member) => {
          const user = await ctx.db.get(member.userId);
          return {
            id: member._id,
            userId: member.userId,
            name: user?.name ?? "Member",
            email: user?.email ?? "",
            workosUserId: user?.workosUserId,
            role: member.role,
            status: member.status,
            source: member.source,
          };
        }),
      ),
    };
  },
});

export const invitations = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccess(ctx, "members:manage");
    return await ctx.db
      .query("workspaceInvitations")
      .withIndex("by_workspaceId_and_state_and_email", (q) =>
        q.eq("workspaceId", workspace._id),
      )
      .paginate(args.paginationOpts);
  },
});

async function addTeamMember(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  teamId: Id<"teams">,
  userId: Id<"users">,
  manager: boolean,
) {
  const existing = await ctx.db
    .query("teamMembers")
    .withIndex("by_teamId_and_userId_and_leftAt", (q) =>
      q.eq("teamId", teamId).eq("userId", userId).eq("leftAt", undefined),
    )
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, { manager });
    return existing._id;
  }
  return await ctx.db.insert("teamMembers", {
    workspaceId,
    teamId,
    userId,
    manager,
    joinedAt: Date.now(),
  });
}

export const createTeam = mutation({
  args: { name: v.string(), description: v.string() },
  handler: async (ctx, args) => {
    const { workspace, user } = await requireWorkspaceAccess(
      ctx,
      "members:manage",
    );
    const limit = productPolicy(workspace.plan).teams;
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspace._id))
      .take(limit + 1);
    if (teams.length >= limit) throw new ConvexError("TEAM_LIMIT_REACHED");
    const name = cleanText(args.name, "", 80);
    if (!name) throw new ConvexError("NAME_REQUIRED");
    if (
      teams.some(
        (t) => !t.archivedAt && t.name.toLowerCase() === name.toLowerCase(),
      )
    )
      throw new ConvexError("TEAM_NAME_TAKEN");
    const teamId = await ctx.db.insert("teams", {
      workspaceId: workspace._id,
      name,
      description: cleanText(args.description, "", 300),
      createdAt: Date.now(),
    });
    await addTeamMember(ctx, workspace._id, teamId, user._id, true);
    await audit(
      ctx,
      workspace._id,
      user._id,
      "team.created",
      "team",
      teamId,
      "Created a team",
    );
    return teamId;
  },
});

export const updateTeam = mutation({
  args: {
    teamId: v.id("teams"),
    name: v.string(),
    description: v.string(),
    archived: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { workspace, user } = await requireWorkspaceAccess(
      ctx,
      "members:manage",
    );
    const team = await ctx.db.get(args.teamId);
    if (team?.workspaceId !== workspace._id)
      throw new ConvexError("TEAM_NOT_FOUND");
    const name = cleanText(args.name, "", 80);
    if (!name) throw new ConvexError("NAME_REQUIRED");
    await ctx.db.patch(team._id, {
      name,
      description: cleanText(args.description, "", 300),
      archivedAt: args.archived ? Date.now() : undefined,
    });
    await audit(
      ctx,
      workspace._id,
      user._id,
      "team.updated",
      "team",
      team._id,
      "Updated team details",
    );
  },
});

export const setTeamMember = mutation({
  args: {
    teamId: v.id("teams"),
    memberUserId: v.id("users"),
    manager: v.boolean(),
    remove: v.boolean(),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspaceAccess(ctx, "teams:manage");
    const { workspace, user, reference } = access;
    const team = await ctx.db.get(args.teamId);
    if (team?.workspaceId !== workspace._id || team.archivedAt)
      throw new ConvexError("TEAM_NOT_FOUND");
    const target = await ctx.db
      .query("teamMembers")
      .withIndex("by_teamId_and_userId_and_leftAt", (q) =>
        q
          .eq("teamId", team._id)
          .eq("userId", args.memberUserId)
          .eq("leftAt", undefined),
      )
      .unique();
    if (!hasWorkspacePermission(access, reference, "members:manage")) {
      const own = await ctx.db
        .query("teamMembers")
        .withIndex("by_teamId_and_userId_and_leftAt", (q) =>
          q
            .eq("teamId", team._id)
            .eq("userId", user._id)
            .eq("leftAt", undefined),
        )
        .unique();
      if (!own?.manager || args.manager || target?.manager)
        throw new ConvexError("FORBIDDEN");
    }
    const member = await ctx.db
      .query("workspaceMemberships")
      .withIndex("by_userId_and_workspaceId", (q) =>
        q.eq("userId", args.memberUserId).eq("workspaceId", workspace._id),
      )
      .unique();
    if (member?.status !== "active") throw new ConvexError("MEMBER_NOT_FOUND");
    if (args.remove) {
      const existing = await ctx.db
        .query("teamMembers")
        .withIndex("by_teamId_and_userId_and_leftAt", (q) =>
          q
            .eq("teamId", team._id)
            .eq("userId", member.userId)
            .eq("leftAt", undefined),
        )
        .unique();
      if (existing) await ctx.db.patch(existing._id, { leftAt: Date.now() });
    } else
      await addTeamMember(
        ctx,
        workspace._id,
        team._id,
        member.userId,
        args.manager,
      );
    await audit(
      ctx,
      workspace._id,
      user._id,
      "team.membership_changed",
      "team",
      team._id,
      "Updated team membership; historical membership retained",
    );
  },
});

export const teamMembers = query({
  args: { teamId: v.id("teams"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const access = await requireWorkspaceMembership(ctx);
    const team = await ctx.db.get(args.teamId);
    if (team?.workspaceId !== access.workspace._id)
      throw new ConvexError("TEAM_NOT_FOUND");
    if (!hasWorkspacePermission(access, access.reference, "members:manage")) {
      const own = await ctx.db
        .query("teamMembers")
        .withIndex("by_teamId_and_userId_and_leftAt", (q) =>
          q
            .eq("teamId", team._id)
            .eq("userId", access.user._id)
            .eq("leftAt", undefined),
        )
        .unique();
      if (!own) throw new ConvexError("FORBIDDEN");
    }
    const page = await ctx.db
      .query("teamMembers")
      .withIndex("by_teamId_and_leftAt", (q) =>
        q.eq("teamId", team._id).eq("leftAt", undefined),
      )
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (row) => ({
          ...row,
          name: (await ctx.db.get(row.userId))?.name ?? "Member",
        })),
      ),
    };
  },
});

export const saveProject = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    name: v.string(),
    key: v.string(),
    costCenter: v.string(),
    teamId: v.optional(v.id("teams")),
    archived: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { workspace, user } = await requireWorkspaceAccess(
      ctx,
      "members:manage",
    );
    const key = args.key.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(key))
      throw new ConvexError("INVALID_PROJECT_KEY");
    if (
      args.teamId &&
      (await ctx.db.get(args.teamId))?.workspaceId !== workspace._id
    )
      throw new ConvexError("TEAM_NOT_FOUND");
    const existing = args.projectId ? await ctx.db.get(args.projectId) : null;
    if (args.projectId && existing?.workspaceId !== workspace._id)
      throw new ConvexError("PROJECT_NOT_FOUND");
    const duplicate = await ctx.db
      .query("projects")
      .withIndex("by_workspaceId_and_key", (q) =>
        q.eq("workspaceId", workspace._id).eq("key", key),
      )
      .unique();
    if (duplicate && duplicate._id !== args.projectId)
      throw new ConvexError("PROJECT_KEY_TAKEN");
    const values = {
      name: cleanText(args.name, key, 80),
      key,
      costCenter: cleanText(args.costCenter, "", 80),
      teamId: args.teamId,
      archivedAt: args.archived ? Date.now() : undefined,
    };
    let id = args.projectId;
    if (id) await ctx.db.patch(id, values);
    else {
      const limit = productPolicy(workspace.plan).projects;
      const rows = await ctx.db
        .query("projects")
        .withIndex("by_workspaceId_and_key", (q) =>
          q.eq("workspaceId", workspace._id),
        )
        .take(limit + 1);
      if (rows.length >= limit) throw new ConvexError("PROJECT_LIMIT_REACHED");
      id = await ctx.db.insert("projects", {
        workspaceId: workspace._id,
        ...values,
        createdAt: Date.now(),
      });
    }
    await audit(
      ctx,
      workspace._id,
      user._id,
      "project.saved",
      "project",
      id,
      "Saved project allocation dimensions",
    );
    return id;
  },
});

export const beginOrganization = internalMutation({
  args: {
    access: accessReferenceValidator,
    name: v.string(),
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireWorkspaceAccessForReference(
      ctx,
      args.access,
      "workspace:manage",
    );
    if (!/^[a-f0-9-]{36}$/i.test(args.requestId))
      throw new ConvexError("INVALID_REQUEST_ID");
    const existing = await ctx.db
      .query("organizationOperations")
      .withIndex("by_userId_and_requestId", (q) =>
        q.eq("userId", user._id).eq("requestId", args.requestId),
      )
      .unique();
    if (existing)
      return { operation: existing, workosUserId: user.workosUserId };
    const owned = await ctx.db
      .query("workspaces")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", user._id))
      .take(11);
    const pending = await ctx.db
      .query("organizationOperations")
      .withIndex("by_userId_and_requestId", (q) => q.eq("userId", user._id))
      .take(11);
    if (
      owned.length + pending.filter((p) => p.state === "pending").length >=
      10
    )
      throw new ConvexError("WORKSPACE_LIMIT_REACHED");
    const name = cleanText(args.name, "", 80);
    if (!name) throw new ConvexError("NAME_REQUIRED");
    const id = await ctx.db.insert("organizationOperations", {
      userId: user._id,
      requestId: args.requestId,
      name,
      state: "pending",
      createdAt: Date.now(),
    });
    return {
      operation: (await ctx.db.get(id))!,
      workosUserId: user.workosUserId,
    };
  },
});

export const recordOrganizationId = internalMutation({
  args: {
    operationId: v.id("organizationOperations"),
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.operationId, { externalId: args.organizationId });
  },
});

export const finishOrganization = internalMutation({
  args: { operationId: v.id("organizationOperations") },
  handler: async (ctx, args) => {
    const operation = await ctx.db.get(args.operationId);
    if (!operation?.externalId)
      throw new ConvexError("ORGANIZATION_NOT_PROVISIONED");
    if (operation.workspaceId) return operation.externalId;
    const now = Date.now();
    const slug = `org-${operation.externalId.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
    const workspaceId = await ctx.db.insert("workspaces", {
      ownerId: operation.userId,
      workosOrganizationId: operation.externalId,
      name: operation.name,
      slug,
      plan: "free",
      isPublic: false,
      companyDataPrivate: true,
      retentionDays: 30,
      createdAt: now,
    });
    const workspace = (await ctx.db.get(workspaceId))!;
    await ctx.db.insert("workspaceMemberships", {
      workspaceId,
      userId: operation.userId,
      workosOrganizationId: operation.externalId,
      role: "owner",
      roles: ["owner"],
      source: "workos",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await createProfileRecords(
      ctx,
      workspace,
      operation.userId,
      operation.userId,
      slug,
      operation.name,
      undefined,
      now,
    );
    await ctx.db.patch(operation._id, { workspaceId, state: "complete" });
    return operation.externalId;
  },
});

export const authorizeAdministration = internalQuery({
  args: {
    access: accessReferenceValidator,
    purpose: v.union(v.literal("members"), v.literal("security")),
    targetUserId: v.optional(v.id("users")),
    role: v.optional(memberRole),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspaceAccessForReference(
      ctx,
      args.access,
      args.purpose === "members" ? "members:manage" : "workspace:manage",
    );
    if (!access.workspace.workosOrganizationId)
      throw new ConvexError("COMPANY_WORKSPACE_REQUIRED");
    if (
      args.purpose === "security" &&
      !productPolicy(access.workspace.plan).enterprise
    )
      throw new ConvexError("ENTERPRISE_REQUIRED");
    if (
      args.role &&
      ["owner", "admin"].includes(args.role) &&
      access.workspace.ownerId !== access.user._id
    )
      throw new ConvexError("OWNER_REQUIRED");
    let targetWorkosUserId: string | undefined;
    if (args.targetUserId) {
      const membership = await ctx.db
        .query("workspaceMemberships")
        .withIndex("by_userId_and_workspaceId", (q) =>
          q
            .eq("userId", args.targetUserId!)
            .eq("workspaceId", access.workspace._id),
        )
        .unique();
      if (!membership || membership.status !== "active")
        throw new ConvexError("MEMBER_NOT_FOUND");
      if (access.workspace.ownerId === membership.userId)
        throw new ConvexError("TRANSFER_OWNERSHIP_FIRST");
      if (
        ["owner", "admin"].includes(membership.role) &&
        access.workspace.ownerId !== access.user._id
      )
        throw new ConvexError("OWNER_REQUIRED");
      if (membership.source === "directory")
        throw new ConvexError("MANAGED_BY_IDENTITY_PROVIDER");
      targetWorkosUserId = (await ctx.db.get(membership.userId))?.workosUserId;
    }
    return {
      workspaceId: access.workspace._id,
      organizationId: access.workspace.workosOrganizationId,
      userId: access.user._id,
      workosUserId: access.user.workosUserId,
      targetWorkosUserId,
      policy: productPolicy(access.workspace.plan),
    };
  },
});

export const reserveInvitation = internalMutation({
  args: {
    access: accessReferenceValidator,
    email: v.string(),
    role: memberRole,
    teamId: v.optional(v.id("teams")),
    externalId: v.string(),
  },
  handler: async (ctx, args) => {
    const { workspace, user } = await requireWorkspaceAccessForReference(
      ctx,
      args.access,
      "members:manage",
    );
    const email = args.email.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new ConvexError("INVALID_EMAIL");
    if (
      ["owner", "admin"].includes(args.role) &&
      workspace.ownerId !== user._id
    )
      throw new ConvexError("OWNER_REQUIRED");
    if (args.role === "owner") throw new ConvexError("USE_OWNERSHIP_TRANSFER");
    if (
      args.teamId &&
      (await ctx.db.get(args.teamId))?.workspaceId !== workspace._id
    )
      throw new ConvexError("TEAM_NOT_FOUND");
    const now = Date.now();
    const limit = productPolicy(workspace.plan).members;
    const existing = await ctx.db
      .query("workspaceInvitations")
      .withIndex("by_workspaceId_and_state_and_email", (q) =>
        q
          .eq("workspaceId", workspace._id)
          .eq("state", "pending")
          .eq("email", email),
      )
      .first();
    if (existing && existing.expiresAt > now)
      throw new ConvexError("INVITATION_ALREADY_PENDING");
    if (!productPolicy(workspace.plan).enterprise) {
      const active = await ctx.db
        .query("workspaceMemberships")
        .withIndex("by_workspaceId_and_status", (q) =>
          q.eq("workspaceId", workspace._id).eq("status", "active"),
        )
        .take(limit + 1);
      const pending = await ctx.db
        .query("workspaceInvitations")
        .withIndex("by_workspaceId_and_state_and_email", (q) =>
          q.eq("workspaceId", workspace._id).eq("state", "pending"),
        )
        .take(limit + 1);
      for (const expired of pending.filter((p) => p.expiresAt <= now))
        await ctx.db.patch(expired._id, { state: "expired", updatedAt: now });
      if (
        active.length + pending.filter((p) => p.expiresAt > now).length >=
        limit
      )
        throw new ConvexError("FREE_WORKSPACE_MEMBER_LIMIT");
    }
    return await ctx.db.insert("workspaceInvitations", {
      workspaceId: workspace._id,
      externalId: args.externalId,
      email,
      role: args.role,
      teamId: args.teamId,
      state: "pending",
      invitedBy: user._id,
      expiresAt: now + 7 * 86_400_000,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateInvitation = internalMutation({
  args: {
    id: v.id("workspaceInvitations"),
    externalId: v.optional(v.string()),
    state: v.union(
      v.literal("pending"),
      v.literal("revoked"),
      v.literal("expired"),
      v.literal("accepted"),
    ),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) throw new ConvexError("INVITATION_NOT_FOUND");
    await ctx.db.patch(row._id, {
      externalId: args.externalId ?? row.externalId,
      state: args.state,
      expiresAt: args.expiresAt ?? row.expiresAt,
      updatedAt: Date.now(),
    });
    await audit(
      ctx,
      row.workspaceId,
      row.invitedBy,
      `invitation.${args.state}`,
      "invitation",
      row._id,
      "Updated organization invitation",
    );
  },
});

export const invitationForAdmin = internalQuery({
  args: {
    access: accessReferenceValidator,
    id: v.id("workspaceInvitations"),
    allowPending: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccessForReference(
      ctx,
      args.access,
      "members:manage",
    );
    const row = await ctx.db.get(args.id);
    if (
      row?.workspaceId !== workspace._id ||
      (row.externalId.startsWith("pending:") && !args.allowPending)
    )
      throw new ConvexError("INVITATION_NOT_FOUND");
    return row;
  },
});

export const recordMembershipChange = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    actorUserId: v.id("users"),
    role: memberRole,
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const member = await ctx.db
      .query("workspaceMemberships")
      .withIndex("by_userId_and_workspaceId", (q) =>
        q.eq("userId", args.userId).eq("workspaceId", args.workspaceId),
      )
      .unique();
    if (!member) throw new ConvexError("MEMBER_NOT_FOUND");
    await ctx.db.patch(member._id, {
      role: args.role,
      roles: [args.role],
      permissions: undefined,
      status: args.active ? "active" : "deactivated",
      authorizationChangedAt: Date.now(),
      updatedAt: Date.now(),
    });
    if (!args.active)
      await ctx.scheduler.runAfter(0, internal.workspaces.offboardDevices, {
        workspaceId: args.workspaceId,
        userId: args.userId,
      });
    await audit(
      ctx,
      args.workspaceId,
      args.actorUserId,
      args.active ? "member.role_changed" : "member.removed",
      "membership",
      member._id,
      "Updated organization access",
    );
  },
});

export const offboardDevices = internalMutation({
  args: { workspaceId: v.id("workspaces"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("collectors")
      .withIndex("by_workspaceId_and_ownerUserId", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("ownerUserId", args.userId),
      )
      .filter((q) => q.eq(q.field("revokedAt"), undefined))
      .take(100);
    for (const row of rows)
      await ctx.db.patch(row._id, { revokedAt: Date.now() });
    const links = await ctx.db
      .query("deviceLinkCodes")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .filter((q) =>
        q.and(
          q.eq(q.field("userId"), args.userId),
          q.eq(q.field("usedAt"), undefined),
          q.gt(q.field("expiresAt"), 0),
        ),
      )
      .take(100);
    for (const link of links) await ctx.db.patch(link._id, { expiresAt: 0 });
    const teams = await ctx.db
      .query("teamMembers")
      .withIndex("by_workspaceId_and_userId_and_leftAt", (q) =>
        q
          .eq("workspaceId", args.workspaceId)
          .eq("userId", args.userId)
          .eq("leftAt", undefined),
      )
      .take(100);
    for (const team of teams)
      await ctx.db.patch(team._id, { leftAt: Date.now() });
    if (rows.length === 100 || links.length === 100 || teams.length === 100)
      await ctx.scheduler.runAfter(
        0,
        internal.workspaces.offboardDevices,
        args,
      );
  },
});

export const configureWorkspace = mutation({
  args: { name: v.string(), retentionDays: v.number() },
  handler: async (ctx, args) => {
    const { workspace, user } = await requireWorkspaceAccess(
      ctx,
      "workspace:manage",
    );
    const maximum = productPolicy(workspace.plan).enterprise ? 365 : 30;
    if (
      !Number.isInteger(args.retentionDays) ||
      args.retentionDays < 1 ||
      args.retentionDays > maximum
    )
      throw new ConvexError("INVALID_RETENTION");
    await ctx.db.patch(workspace._id, {
      name: cleanText(args.name, workspace.name, 80),
      retentionDays: args.retentionDays,
    });
    await audit(
      ctx,
      workspace._id,
      user._id,
      "workspace.settings_updated",
      "workspace",
      workspace._id,
      "Changed workspace settings; retention applies to detailed telemetry, not historical daily totals",
    );
  },
});

// Operator-only commercial activation. No public mutation accepts a plan name.
export const activateEnterprise = internalMutation({
  args: { workspaceId: v.id("workspaces"), contractReference: v.string() },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace?.workosOrganizationId || !args.contractReference.trim())
      throw new ConvexError("CONTRACT_AND_COMPANY_REQUIRED");
    await ctx.db.patch(workspace._id, {
      plan: "enterprise",
      contractReference: cleanText(args.contractReference, "", 100),
      enterpriseActivatedAt: Date.now(),
    });
    await audit(
      ctx,
      workspace._id,
      undefined,
      "enterprise.activated",
      "workspace",
      workspace._id,
      "Activated enterprise after commercial approval",
    );
  },
});
