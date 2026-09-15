"use node";

import { WorkOS } from "@workos-inc/node";
import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { accessReference } from "./account";
import { memberRole } from "./productPolicy";

function workos() {
  const key = process.env.WORKOS_API_KEY;
  if (!key) throw new ConvexError("ORGANIZATION_SERVICE_NOT_CONFIGURED");
  return new WorkOS(key, { clientId: process.env.WORKOS_CLIENT_ID });
}

export const create = action({
  args: { name: v.string(), requestId: v.string() },
  handler: async (ctx, args): Promise<{ organizationId: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("AUTH_REQUIRED");
    await ctx.runMutation(internal.rateLimits.consumeManagementAttempt, {});
    const state = await ctx.runMutation(internal.workspaces.beginOrganization, {
      access: accessReference(identity),
      ...args,
    });
    const sdk = workos();
    let organizationId = state.operation.externalId;
    if (!organizationId) {
      const organization = await sdk.organizations.createOrganization(
        {
          name: state.operation.name,
          externalId: `usagemax:${state.operation._id}`,
        },
        { idempotencyKey: `usagemax:${state.operation._id}` },
      );
      organizationId = organization.id;
      await ctx.runMutation(internal.workspaces.recordOrganizationId, {
        operationId: state.operation._id,
        organizationId,
      });
    }
    if (!state.operation.workspaceId) {
      const memberships = await sdk.userManagement.listOrganizationMemberships({
        organizationId,
        userId: state.workosUserId,
        limit: 10,
      });
      const existing = memberships.data.find((m) => m.status === "active");
      if (!existing)
        await sdk.userManagement.createOrganizationMembership({
          organizationId,
          userId: state.workosUserId,
          roleSlug: "owner",
        });
      else if (existing.role.slug !== "owner")
        await sdk.userManagement.updateOrganizationMembership(existing.id, {
          roleSlug: "owner",
        });
      await ctx.runMutation(internal.workspaces.finishOrganization, {
        operationId: state.operation._id,
      });
    }
    return { organizationId };
  },
});

export const invite = action({
  args: {
    email: v.string(),
    role: memberRole,
    teamId: v.optional(v.id("teams")),
  },
  handler: async (ctx, args): Promise<{ sent: boolean }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("AUTH_REQUIRED");
    const reference = accessReference(identity);
    await ctx.runMutation(internal.rateLimits.consumeManagementAttempt, {});
    const access = await ctx.runQuery(
      internal.workspaces.authorizeAdministration,
      { access: reference, purpose: "members", role: args.role },
    );
    const id = await ctx.runMutation(internal.workspaces.reserveInvitation, {
      access: reference,
      ...args,
      externalId: `pending:${crypto.randomUUID()}`,
    });
    try {
      const invitation = await workos().userManagement.sendInvitation({
        email: args.email.trim().toLowerCase(),
        roleSlug: args.role,
        organizationId: access.organizationId,
        inviterUserId: access.workosUserId,
        expiresInDays: 7,
      });
      await ctx.runMutation(internal.workspaces.updateInvitation, {
        id,
        externalId: invitation.id,
        state: "pending",
        expiresAt: Date.parse(invitation.expiresAt),
      });
      return { sent: true };
    } catch {
      // An uncertain external send retains its reservation for reconciliation.
      throw new ConvexError("INVITATION_SEND_FAILED_CHECK_MEMBER_LIST");
    }
  },
});

export const manageInvitation = action({
  args: {
    id: v.id("workspaceInvitations"),
    operation: v.union(
      v.literal("resend"),
      v.literal("revoke"),
      v.literal("reconcile"),
    ),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("AUTH_REQUIRED");
    await ctx.runMutation(internal.rateLimits.consumeManagementAttempt, {});
    const row = await ctx.runQuery(internal.workspaces.invitationForAdmin, {
      access: accessReference(identity),
      id: args.id,
      allowPending: args.operation === "reconcile",
    });
    const sdk = workos();
    if (args.operation === "reconcile") {
      const organizationId = accessReference(identity).organizationId;
      if (!organizationId) throw new ConvexError("COMPANY_WORKSPACE_REQUIRED");
      const invitations = await sdk.userManagement.listInvitations({
        organizationId,
        email: row.email,
        limit: 100,
      });
      const matched = invitations.data.find(
        (i) =>
          i.organizationId === organizationId &&
          i.email.toLowerCase() === row.email &&
          Date.parse(i.createdAt) >= row.createdAt - 60_000,
      );
      if (!matched) throw new ConvexError("INVITATION_NOT_VISIBLE_RETRY_LATER");
      const state =
        matched.state === "accepted"
          ? "accepted"
          : matched.state === "revoked"
            ? "revoked"
            : Date.parse(matched.expiresAt) < Date.now()
              ? "expired"
              : "pending";
      await ctx.runMutation(internal.workspaces.updateInvitation, {
        id: row._id,
        externalId: matched.id,
        state,
        expiresAt: Date.parse(matched.expiresAt),
      });
      return { success: true };
    }
    const upstream = await sdk.userManagement.getInvitation(row.externalId);
    if (upstream.organizationId !== accessReference(identity).organizationId)
      throw new ConvexError("INVITATION_NOT_FOUND");
    const result =
      args.operation === "revoke"
        ? await sdk.userManagement.revokeInvitation(row.externalId)
        : await sdk.userManagement.resendInvitation(row.externalId);
    await ctx.runMutation(internal.workspaces.updateInvitation, {
      id: row._id,
      state: args.operation === "revoke" ? "revoked" : "pending",
      expiresAt: Date.parse(result.expiresAt),
    });
    return { success: true };
  },
});

export const changeMember = action({
  args: { userId: v.id("users"), role: memberRole, remove: v.boolean() },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("AUTH_REQUIRED");
    await ctx.runMutation(internal.rateLimits.consumeManagementAttempt, {});
    if (args.role === "owner") throw new ConvexError("USE_OWNERSHIP_TRANSFER");
    const access = await ctx.runQuery(
      internal.workspaces.authorizeAdministration,
      {
        access: accessReference(identity),
        purpose: "members",
        targetUserId: args.userId,
        role: args.role,
      },
    );
    if (!access.targetWorkosUserId) throw new ConvexError("MEMBER_NOT_FOUND");
    const sdk = workos();
    const result = await sdk.userManagement.listOrganizationMemberships({
      organizationId: access.organizationId,
      userId: access.targetWorkosUserId,
      limit: 10,
    });
    const membership = result.data.find(
      (m) => m.status === "active" || (args.remove && m.status === "inactive"),
    );
    if (!membership) throw new ConvexError("MEMBER_NOT_FOUND");
    if (args.remove && membership.status === "active")
      await sdk.userManagement.deactivateOrganizationMembership(membership.id);
    else if (!args.remove)
      await sdk.userManagement.updateOrganizationMembership(membership.id, {
        roleSlug: args.role,
      });
    await ctx.runMutation(internal.workspaces.recordMembershipChange, {
      workspaceId: access.workspaceId,
      userId: args.userId,
      actorUserId: access.userId,
      role: args.role,
      active: !args.remove,
    });
    return { success: true };
  },
});

export const adminPortal = action({
  args: {
    intent: v.union(
      v.literal("sso"),
      v.literal("dsync"),
      v.literal("audit_logs"),
      v.literal("log_streams"),
      v.literal("domain_verification"),
    ),
  },
  handler: async (ctx, args): Promise<{ url: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("AUTH_REQUIRED");
    await ctx.runMutation(internal.rateLimits.consumeManagementAttempt, {});
    const access = await ctx.runQuery(
      internal.workspaces.authorizeAdministration,
      { access: accessReference(identity), purpose: "security" },
    );
    const result = await workos().adminPortal.generateLink({
      organization: access.organizationId,
      intent: args.intent,
      returnUrl: "https://usagemax.com/workspace?tab=settings",
    });
    return { url: result.link };
  },
});
