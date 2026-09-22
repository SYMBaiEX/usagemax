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

export const applyDirectoryEvent = internalMutation({
  args: {
    eventId: v.string(),
    eventName: v.string(),
    organizationId: v.string(),
    directoryId: v.optional(v.string()),
    directoryName: v.optional(v.string()),
    directoryType: v.optional(v.string()),
    directoryUserId: v.optional(v.string()),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    state: v.optional(v.string()),
    roleSlugs: v.array(v.string()),
    occurredAt: v.number(),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const receipt = await ctx.db
      .query("workosEventReceipts")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .unique();
    if (receipt) return { replay: true, outcome: receipt.outcome };
    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_workosOrganizationId", (q) =>
        q.eq("workosOrganizationId", args.organizationId),
      )
      .unique();
    const directory = workspace && args.directoryId
      ? await ctx.db.query("directories").withIndex("by_workspaceId_and_directoryId", (q) =>
          q.eq("workspaceId", workspace._id).eq("directoryId", args.directoryId!),
        ).unique()
      : null;
    let outcome = "ignored_unprovisioned_organization";
    if (workspace && args.eventName === "dsync.activated" && args.directoryId) {
      const existingDirectory = directory;
      if (existingDirectory && existingDirectory.updatedAt > args.occurredAt) {
        outcome = "ignored_stale_event";
      } else {
      const values = {
        workspaceId: workspace._id,
        organizationId: args.organizationId,
        directoryId: args.directoryId,
        name: args.directoryName,
        type: args.directoryType,
        state: "active" as const,
        updatedAt: args.occurredAt,
      };
      if (existingDirectory) await ctx.db.patch(existingDirectory._id, { ...values, deletedAt: undefined });
      else await ctx.db.insert("directories", { ...values, createdAt: args.now });
      outcome = "directory_activated";
      }
    } else if (workspace && args.eventName === "dsync.deleted" && args.directoryId) {
      if (directory && directory.updatedAt > args.occurredAt) {
        outcome = "ignored_stale_event";
      } else {
        if (directory)
          await ctx.db.patch(directory._id, {
            state: "deleted",
            updatedAt: args.occurredAt,
            deletedAt: args.now,
          });
        await ctx.scheduler.runAfter(0, internal.workos.continueDirectoryDeletion, {
          workspaceId: workspace._id,
          directoryId: args.directoryId,
          occurredAt: args.occurredAt,
          phase: "users",
          cursor: null,
        });
        outcome = "directory_deactivation_scheduled";
      }
    } else if (
      workspace &&
      args.directoryId &&
      args.directoryUserId &&
      args.email &&
      args.eventName.startsWith("dsync.user.")
    ) {
      const email = args.email.trim().toLowerCase();
      const state = args.state === "inactive" || args.eventName === "dsync.user.deleted"
        ? args.eventName === "dsync.user.deleted" ? "deleted" : "inactive"
        : "active";
      const existing = await ctx.db
        .query("directoryUsers")
        .withIndex("by_workspaceId_and_directoryUserId", (q) =>
          q.eq("workspaceId", workspace._id).eq("directoryUserId", args.directoryUserId!),
        )
        .unique();
      const staleDirectoryUser = existing && existing.updatedAt > args.occurredAt;
      // A directory must be explicitly reactivated before its users can regain
      // access; a late user-updated event alone must not resurrect it.
      const staleDirectory = directory !== null &&
        (directory.state === "deleted" || directory.updatedAt > args.occurredAt);
      if (staleDirectoryUser || staleDirectory) {
        outcome = "ignored_stale_event";
      } else {
      const user = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .take(10);
      const localUser = user[0];
      const membership = localUser
        ? await ctx.db.query("workspaceMemberships").withIndex("by_workspaceId_and_userId", (q) =>
            q.eq("workspaceId", workspace._id).eq("userId", localUser._id),
          ).unique()
        : null;
      if (membership?.authorizationChangedAt !== undefined && membership.authorizationChangedAt > args.occurredAt) {
        outcome = "ignored_stale_event";
      } else {
      const roles = args.roleSlugs.length ? args.roleSlugs : ["member"];
      const values = {
        workspaceId: workspace._id,
        directoryId: args.directoryId,
        directoryUserId: args.directoryUserId,
        email,
        name: args.name,
        state: state as "active" | "inactive" | "deleted",
        roles,
        lastSyncedAt: args.now,
        updatedAt: args.occurredAt,
      };
      if (existing) await ctx.db.patch(existing._id, values);
      else await ctx.db.insert("directoryUsers", values);
      if (localUser) {
        const nextStatus = state === "active" ? "active" : "deactivated";
        if (membership) {
          await ctx.db.patch(membership._id, {
            directoryId: args.directoryId,
            source: "directory",
            role: roles[0],
            roles,
            status: nextStatus,
            lastSyncedAt: args.now,
            authorizationChangedAt: args.occurredAt,
            updatedAt: args.occurredAt,
          });
          if (nextStatus !== "active")
            await ctx.scheduler.runAfter(0, internal.workspaces.offboardDevices, {
              workspaceId: workspace._id,
              userId: localUser._id,
            });
        } else {
          outcome = state === "active" ? "directory_user_active" : "directory_user_deactivated";
        }
      }
      if (outcome === "ignored_unprovisioned_organization") {
        outcome = localUser
          ? state === "active" ? "directory_user_active" : "directory_user_deactivated"
          : "directory_user_pending_sign_in";
      }
      }
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

/** Continue directory-user and membership offboarding in bounded, resumable pages. */
export const continueDirectoryDeletion = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    directoryId: v.string(),
    occurredAt: v.number(),
    phase: v.union(v.literal("users"), v.literal("memberships")),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const directory = await ctx.db.query("directories").withIndex("by_workspaceId_and_directoryId", (q) =>
      q.eq("workspaceId", args.workspaceId).eq("directoryId", args.directoryId),
    ).unique();
    if (directory && (directory.state !== "deleted" || directory.updatedAt < args.occurredAt)) {
      return { directoryUsersProcessed: 0, membershipsProcessed: 0, continued: false, superseded: true };
    }
    const offboardingAt = Math.max(args.occurredAt, directory?.updatedAt ?? args.occurredAt);
    if (args.phase === "users") {
      const page = await ctx.db.query("directoryUsers")
        .withIndex("by_directoryId", (q) => q.eq("directoryId", args.directoryId))
        .paginate({ numItems: 100, cursor: args.cursor });
      for (const directoryUser of page.page) {
        if (directoryUser.workspaceId !== args.workspaceId || directoryUser.state === "deleted") continue;
        await ctx.db.patch(directoryUser._id, {
          state: "deleted",
          lastSyncedAt: Date.now(),
        });
      }
      await ctx.scheduler.runAfter(0, internal.workos.continueDirectoryDeletion, {
        ...args,
        phase: page.isDone ? "memberships" : "users",
        cursor: page.isDone ? null : page.continueCursor,
      });
      return { directoryUsersProcessed: page.page.length, membershipsProcessed: 0, continued: true, superseded: false };
    }

    const page = await ctx.db.query("workspaceMemberships")
        .withIndex("by_workspaceId_and_directoryId", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("directoryId", args.directoryId),
        )
        .paginate({ numItems: 100, cursor: args.cursor });
    for (const membership of page.page) {
      if (membership.source !== "directory" || membership.status !== "active") continue;
      await ctx.db.patch(membership._id, {
        status: "deactivated",
        authorizationChangedAt: offboardingAt,
        lastSyncedAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.scheduler.runAfter(0, internal.workspaces.offboardDevices, {
        workspaceId: args.workspaceId,
        userId: membership.userId,
      });
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.workos.continueDirectoryDeletion, {
        ...args,
        cursor: page.continueCursor,
      });
    }
    return {
      directoryUsersProcessed: 0,
      membershipsProcessed: page.page.length,
      continued: !page.isDone,
      superseded: false,
    };
  },
});
