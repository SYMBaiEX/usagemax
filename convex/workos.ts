import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

function membershipStatus(value: string | undefined) {
  if (value === "active") return "active" as const;
  if (value === "pending") return "invited" as const;
  return "deactivated" as const;
}

export const deactivateOrganizationMemberships = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    occurredAt: v.number(),
    now: v.number(),
  },
  handler: async (ctx, args): Promise<{ deactivated: number; continued: boolean }> => {
    const batchSize = 100;
    const [active, invited] = await Promise.all([
      ctx.db.query("workspaceMemberships").withIndex("by_workspaceId_and_status", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", "active"),
      ).take(batchSize),
      ctx.db.query("workspaceMemberships").withIndex("by_workspaceId_and_status", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", "invited"),
      ).take(batchSize),
    ]);
    for (const membership of [...active, ...invited]) {
      await ctx.db.patch(membership._id, {
        status: "deactivated",
        lastSyncedAt: args.now,
        authorizationChangedAt: args.occurredAt,
        updatedAt: args.now,
      });
    }
    const continued = active.length === batchSize || invited.length === batchSize;
    if (continued) {
      await ctx.scheduler.runAfter(0, internal.workos.deactivateOrganizationMemberships, args);
    }
    return { deactivated: active.length + invited.length, continued };
  },
});

export const applyLifecycleEvent = internalMutation({
  args: {
    eventId: v.string(),
    eventName: v.string(),
    organizationId: v.string(),
    userId: v.optional(v.string()),
    status: v.optional(v.string()),
    roleSlugs: v.array(v.string()),
    directoryManaged: v.optional(v.boolean()),
    organizationName: v.optional(v.string()),
    occurredAt: v.number(),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const receipt = await ctx.db.query("workosEventReceipts").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).unique();
    if (receipt) return { replay: true, outcome: receipt.outcome };

    const workspace = await ctx.db.query("workspaces").withIndex("by_workosOrganizationId", (q) =>
      q.eq("workosOrganizationId", args.organizationId),
    ).unique();
    let outcome = "ignored_unprovisioned_organization";

    if (args.eventName.startsWith("organization.") && workspace?.workosUpdatedAt && workspace.workosUpdatedAt >= args.occurredAt) {
      outcome = "ignored_stale_event";
    } else if (workspace && args.eventName === "organization.updated" && args.organizationName) {
      await ctx.db.patch(workspace._id, { name: args.organizationName, workosUpdatedAt: args.occurredAt });
      await ctx.db.insert("auditEvents", {
        workspaceId: workspace._id,
        action: "organization.updated",
        targetType: "workspace",
        targetId: String(workspace._id),
        summary: "Synchronized organization details from WorkOS",
        createdAt: args.now,
      });
      outcome = "organization_updated";
    } else if (workspace && args.eventName === "organization.deleted") {
      await ctx.db.patch(workspace._id, {
        isPublic: false,
        workosUpdatedAt: args.occurredAt,
        accessDisabledAt: args.now,
      });
      await ctx.scheduler.runAfter(0, internal.workos.deactivateOrganizationMemberships, {
        workspaceId: workspace._id,
        occurredAt: args.occurredAt,
        now: args.now,
      });
      await ctx.db.insert("auditEvents", {
        workspaceId: workspace._id,
        action: "organization.deactivated",
        targetType: "workspace",
        targetId: String(workspace._id),
        summary: "Deactivated organization access after WorkOS deletion",
        createdAt: args.now,
      });
      outcome = "organization_deactivated";
    } else if (workspace && args.userId && args.eventName.startsWith("organization_membership.")) {
      const user = await ctx.db.query("users").withIndex("by_workosUserId", (q) => q.eq("workosUserId", args.userId!)).unique();
      if (user) {
        const existing = await ctx.db.query("workspaceMemberships").withIndex("by_userId_and_workspaceId", (q) =>
          q.eq("userId", user._id).eq("workspaceId", workspace._id),
        ).unique();
        if (existing?.authorizationChangedAt && existing.authorizationChangedAt >= args.occurredAt) {
          outcome = "ignored_stale_event";
        } else {
          const status = args.eventName === "organization_membership.deleted" ? "deactivated" : membershipStatus(args.status);
          const roles = args.roleSlugs.length ? args.roleSlugs : existing?.roles ?? [existing?.role ?? "member"];
          const values = {
            workosOrganizationId: args.organizationId,
            role: roles[0],
            roles,
            source: args.directoryManaged ? "directory" as const : "workos" as const,
            status,
            lastSyncedAt: args.now,
            authorizationChangedAt: args.occurredAt,
            updatedAt: args.now,
          };
          if (existing) await ctx.db.patch(existing._id, values);
          else await ctx.db.insert("workspaceMemberships", {
            workspaceId: workspace._id,
            userId: user._id,
            createdAt: args.now,
            ...values,
          });
          if (status !== "active") await ctx.scheduler.runAfter(0, internal.workspaces.offboardDevices, { workspaceId: workspace._id, userId: user._id });
          await ctx.db.insert("auditEvents", {
            workspaceId: workspace._id,
            actorUserId: user._id,
            action: status === "active" ? "membership.synchronized" : "membership.deactivated",
            targetType: "membership",
            targetId: existing ? String(existing._id) : undefined,
            summary: status === "active" ? "Synchronized organization membership from WorkOS" : "Deactivated organization membership from WorkOS",
            createdAt: args.now,
          });
          outcome = status === "active" ? "membership_active" : status === "invited" ? "membership_invited" : "membership_deactivated";
        }
      } else {
        outcome = "ignored_unknown_user";
      }
    }

    await ctx.db.insert("workosEventReceipts", {
      eventId: args.eventId,
      eventName: args.eventName,
      outcome,
      createdAt: args.now,
    });
    return { replay: false, outcome };
  },
});
