import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";

import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

describe("WorkOS lifecycle events", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });
  afterEach(() => vi.useRealTimers());

  test("deactivates and reactivates an organization membership idempotently", async () => {
    const admin = t.withIdentity({
      subject: "user_01WEBHOOKADMIN",
      issuer: "https://api.workos.com/",
      tokenIdentifier: "https://api.workos.com/|user_01WEBHOOKADMIN",
      org_id: "org_01WEBHOOK",
      role: "admin",
    });
    await admin.mutation(api.account.ensureProfile, { handle: "webhook-org" });

    const member = t.withIdentity({
      subject: "user_01WEBHOOKMEMBER",
      issuer: "https://api.workos.com/",
      tokenIdentifier: "https://api.workos.com/|user_01WEBHOOKMEMBER",
      org_id: "org_01WEBHOOK",
      role: "member",
    });
    await member.mutation(api.account.ensureProfile, { handle: "ignored" });
    expect((await member.query(api.account.current, {}))?.profile?.handle).toBe("webhook-org");

    const inactive = await t.mutation(internal.workos.applyLifecycleEvent, {
      eventId: "event_inactive",
      eventName: "organization_membership.updated",
      organizationId: "org_01WEBHOOK",
      userId: "user_01WEBHOOKMEMBER",
      status: "inactive",
      roleSlugs: ["member"],
      directoryManaged: true,
      occurredAt: 1_800_000_000_000,
      now: 1_800_000_000_000,
    });
    expect(inactive).toEqual({ replay: false, outcome: "membership_deactivated" });
    expect((await member.query(api.account.current, {}))?.workspace).toBeNull();
    await expect(member.mutation(api.account.ensureProfile, { handle: "cannot-reactivate" })).rejects.toThrow("SESSION_REFRESH_REQUIRED");
    await expect(t.mutation(internal.workos.applyLifecycleEvent, {
      eventId: "event_inactive",
      eventName: "organization_membership.updated",
      organizationId: "org_01WEBHOOK",
      userId: "user_01WEBHOOKMEMBER",
      status: "inactive",
      roleSlugs: ["member"],
      occurredAt: 1_800_000_000_000,
      now: 1_800_000_000_001,
    })).resolves.toEqual({ replay: true, outcome: "membership_deactivated" });

    await expect(t.mutation(internal.workos.applyLifecycleEvent, {
      eventId: "event_stale_active",
      eventName: "organization_membership.updated",
      organizationId: "org_01WEBHOOK",
      userId: "user_01WEBHOOKMEMBER",
      status: "active",
      roleSlugs: ["admin"],
      occurredAt: 1_799_999_999_999,
      now: 1_800_000_000_001,
    })).resolves.toEqual({ replay: false, outcome: "ignored_stale_event" });
    expect((await member.query(api.account.current, {}))?.workspace).toBeNull();

    await expect(t.mutation(internal.workos.applyLifecycleEvent, {
      eventId: "event_active",
      eventName: "organization_membership.updated",
      organizationId: "org_01WEBHOOK",
      userId: "user_01WEBHOOKMEMBER",
      status: "active",
      roleSlugs: ["viewer"],
      directoryManaged: true,
      occurredAt: 1_800_000_000_002,
      now: 1_800_000_000_002,
    })).resolves.toEqual({ replay: false, outcome: "membership_active" });
    expect((await member.query(api.account.current, {}))?.profile?.handle).toBe("webhook-org");

    const stored = await t.run(async (ctx) => {
      const user = await ctx.db.query("users").filter((q) => q.eq(q.field("workosUserId"), "user_01WEBHOOKMEMBER")).unique();
      const workspace = await ctx.db.query("workspaces").filter((q) => q.eq(q.field("workosOrganizationId"), "org_01WEBHOOK")).unique();
      const membership = user && workspace
        ? await ctx.db.query("workspaceMemberships").filter((q) => q.and(
            q.eq(q.field("userId"), user._id),
            q.eq(q.field("workspaceId"), workspace._id),
          )).unique()
        : null;
      const receipts = await ctx.db.query("workosEventReceipts").collect();
      return { membership, receipts };
    });
    expect(stored.membership).toMatchObject({ status: "active", role: "viewer", source: "directory" });
    expect(stored.receipts).toHaveLength(3);
  });

  test("requires a refreshed JWT after a membership authorization change", async () => {
    const staleAdmin = t.withIdentity({
      subject: "user_01STALEADMIN",
      issuer: "https://api.workos.com/",
      tokenIdentifier: "https://api.workos.com/|user_01STALEADMIN",
      org_id: "org_01STALEJWT",
      role: "admin",
      iat: 1_799_999_999,
    });
    await staleAdmin.mutation(api.account.ensureProfile, { handle: "stale-jwt-org" });
    await t.mutation(internal.workos.applyLifecycleEvent, {
      eventId: "event_role_changed",
      eventName: "organization_membership.updated",
      organizationId: "org_01STALEJWT",
      userId: "user_01STALEADMIN",
      status: "active",
      roleSlugs: ["member"],
      occurredAt: 1_800_000_000_000,
      now: 1_800_000_000_001,
    });
    await expect(staleAdmin.action(api.account.createCollector, { name: "Stale privilege" })).rejects.toThrow("FORBIDDEN");

    const refreshedAdmin = t.withIdentity({
      subject: "user_01STALEADMIN",
      issuer: "https://api.workos.com/",
      tokenIdentifier: "https://api.workos.com/|user_01STALEADMIN",
      org_id: "org_01STALEJWT",
      role: "admin",
      iat: 1_800_000_001,
    });
    await expect(refreshedAdmin.action(api.account.createCollector, { name: "Fresh privilege" })).resolves.toMatchObject({
      keyPrefix: expect.stringMatching(/^umx_/),
    });
  });

  test("projects Directory Sync users and deactivates them on lifecycle changes", async () => {
    vi.useFakeTimers();
    const admin = t.withIdentity({
      subject: "user_01DIRECTORYADMIN",
      issuer: "https://api.workos.com/",
      tokenIdentifier: "https://api.workos.com/|user_01DIRECTORYADMIN",
      org_id: "org_01DIRECTORY",
      role: "admin",
    });
    await admin.mutation(api.account.ensureProfile, { handle: "directory-org" });
    const member = t.withIdentity({
      subject: "user_01DIRECTORYMEMBER",
      issuer: "https://api.workos.com/",
      tokenIdentifier: "https://api.workos.com/|user_01DIRECTORYMEMBER",
      org_id: "org_01DIRECTORY",
      role: "member",
      email: "member@example.com",
    });
    await member.mutation(api.account.ensureProfile, { handle: "ignored" });

    await expect(t.mutation(internal.workos.applyDirectoryEvent, {
      eventId: "directory_activated",
      eventName: "dsync.activated",
      organizationId: "org_01DIRECTORY",
      directoryId: "directory_01DIRECTORY",
      directoryName: "Example directory",
      directoryType: "generic scim v2.0",
      roleSlugs: [],
      occurredAt: 1_800_000_000_000,
      now: 1_800_000_000_000,
    })).resolves.toEqual({ replay: false, outcome: "directory_activated" });

    await expect(t.mutation(internal.workos.applyDirectoryEvent, {
      eventId: "directory_user_active",
      eventName: "dsync.user.created",
      organizationId: "org_01DIRECTORY",
      directoryId: "directory_01DIRECTORY",
      directoryUserId: "directory_user_01",
      email: "member@example.com",
      name: "Directory Member",
      state: "active",
      roleSlugs: ["member"],
      occurredAt: 1_800_000_000_000,
      now: 1_800_000_000_000,
    })).resolves.toEqual({ replay: false, outcome: "directory_user_active" });

    const active = await t.run(async (ctx) => {
      const user = await ctx.db.query("users").filter((q) => q.eq(q.field("email"), "member@example.com")).unique();
      const workspace = await ctx.db.query("workspaces").filter((q) => q.eq(q.field("workosOrganizationId"), "org_01DIRECTORY")).unique();
      const membership = user
        ? await ctx.db.query("workspaceMemberships").filter((q) => q.eq(q.field("userId"), user._id)).unique()
        : null;
      const directoryUser = workspace
        ? await ctx.db.query("directoryUsers").filter((q) => q.and(q.eq(q.field("workspaceId"), workspace._id), q.eq(q.field("directoryUserId"), "directory_user_01"))).unique()
        : null;
      return { membership, directoryUser };
    });
    expect(active.membership).toMatchObject({ source: "directory", directoryId: "directory_01DIRECTORY", status: "active" });
    expect(active.directoryUser).toMatchObject({ email: "member@example.com", state: "active" });

    await expect(t.mutation(internal.workos.applyDirectoryEvent, {
      eventId: "directory_user_inactive",
      eventName: "dsync.user.updated",
      organizationId: "org_01DIRECTORY",
      directoryId: "directory_01DIRECTORY",
      directoryUserId: "directory_user_01",
      email: "member@example.com",
      state: "inactive",
      roleSlugs: ["member"],
      occurredAt: 1_800_000_000_001,
      now: 1_800_000_000_001,
    })).resolves.toEqual({ replay: false, outcome: "directory_user_deactivated" });
    await expect(t.mutation(internal.workos.applyDirectoryEvent, {
      eventId: "directory_user_inactive",
      eventName: "dsync.user.updated",
      organizationId: "org_01DIRECTORY",
      directoryId: "directory_01DIRECTORY",
      directoryUserId: "directory_user_01",
      email: "member@example.com",
      state: "inactive",
      roleSlugs: ["member"],
      occurredAt: 1_800_000_000_001,
      now: 1_800_000_000_002,
    })).resolves.toEqual({ replay: true, outcome: "directory_user_deactivated" });

    await expect(t.mutation(internal.workos.applyDirectoryEvent, {
      eventId: "directory_deleted",
      eventName: "dsync.deleted",
      organizationId: "org_01DIRECTORY",
      directoryId: "directory_01DIRECTORY",
      roleSlugs: [],
      occurredAt: 1_800_000_000_002,
      now: 1_800_000_000_002,
    })).resolves.toEqual({ replay: false, outcome: "directory_deactivation_scheduled" });
    await expect(t.mutation(internal.workos.applyDirectoryEvent, {
      eventId: "directory_user_old_active",
      eventName: "dsync.user.updated",
      organizationId: "org_01DIRECTORY",
      directoryId: "directory_01DIRECTORY",
      directoryUserId: "directory_user_01",
      email: "member@example.com",
      state: "active",
      roleSlugs: ["admin"],
      occurredAt: 1_800_000_000_001,
      now: 1_800_000_000_003,
    })).resolves.toEqual({ replay: false, outcome: "ignored_stale_event" });
    await expect(t.mutation(internal.workos.applyDirectoryEvent, {
      eventId: "directory_user_active_after_delete",
      eventName: "dsync.user.updated",
      organizationId: "org_01DIRECTORY",
      directoryId: "directory_01DIRECTORY",
      directoryUserId: "directory_user_01",
      email: "member@example.com",
      state: "active",
      roleSlugs: ["admin"],
      occurredAt: 1_800_000_000_003,
      now: 1_800_000_000_004,
    })).resolves.toEqual({ replay: false, outcome: "ignored_stale_event" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const deactivated = await t.run(async (ctx) => {
      const user = (await ctx.db.query("users").collect()).find((row) => row.email === "member@example.com");
      const workspace = (await ctx.db.query("workspaces").collect()).find((row) => row.workosOrganizationId === "org_01DIRECTORY");
      const membership = user && workspace ? (await ctx.db.query("workspaceMemberships").collect()).find((row) => row.userId === user._id && row.workspaceId === workspace._id) : null;
      return { membership };
    });
    expect(deactivated.membership?.status).toBe("deactivated");
  });

  test("directory removal resumes through bounded pages beyond one batch", async () => {
    vi.useFakeTimers();
    const admin = t.withIdentity({
      subject: "user_01DIRECTORYBATCHADMIN",
      issuer: "https://api.workos.com/",
      tokenIdentifier: "https://api.workos.com/|user_01DIRECTORYBATCHADMIN",
      org_id: "org_01DIRECTORYBATCH",
      role: "admin",
    });
    await admin.mutation(api.account.ensureProfile, { handle: "directory-batch" });
    const { workspaceId } = await t.run(async (ctx) => {
      const workspace = (await ctx.db.query("workspaces").collect()).find((row) => row.workosOrganizationId === "org_01DIRECTORYBATCH");
      if (!workspace) throw new Error("workspace missing");
      const now = 1_800_000_000_000;
      await ctx.db.insert("directories", { workspaceId: workspace._id, organizationId: "org_01DIRECTORYBATCH", directoryId: "directory_batch", state: "active", createdAt: now, updatedAt: now });
      for (let i = 0; i < 205; i++) {
        const userId = await ctx.db.insert("users", { workosUserId: `user_batch_${i}`, email: `batch-${i}@example.com`, createdAt: now, updatedAt: now, lastSeenAt: now });
        await ctx.db.insert("directoryUsers", { workspaceId: workspace._id, directoryId: "directory_batch", directoryUserId: `dir-user-${i}`, email: `batch-${i}@example.com`, state: "active", roles: ["member"], lastSyncedAt: now, updatedAt: now });
        await ctx.db.insert("workspaceMemberships", { workspaceId: workspace._id, userId, directoryId: "directory_batch", role: "member", roles: ["member"], source: "directory", status: "active", createdAt: now, updatedAt: now });
      }
      return { workspaceId: workspace._id };
    });
    await expect(t.mutation(internal.workos.applyDirectoryEvent, {
      eventId: "directory_batch_deleted",
      eventName: "dsync.deleted",
      organizationId: "org_01DIRECTORYBATCH",
      directoryId: "directory_batch",
      roleSlugs: [],
      occurredAt: 1_800_000_000_001,
      now: 1_800_000_000_002,
    })).resolves.toMatchObject({ replay: false, outcome: "directory_deactivation_scheduled" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const counts = await t.run(async (ctx) => ({
      active: (await ctx.db.query("workspaceMemberships").collect()).filter((row) => row.workspaceId === workspaceId && row.directoryId === "directory_batch" && row.status === "active").length,
      undeleted: (await ctx.db.query("directoryUsers").collect()).filter((row) => row.directoryId === "directory_batch" && row.workspaceId === workspaceId && row.state !== "deleted").length,
    }));
    expect(counts).toEqual({ active: 0, undeleted: 0 });
  });

  test("rejects unsigned lifecycle HTTP requests and accepts a valid WorkOS signature", async () => {
    const secret = "whsec_test_usagemax_lifecycle";
    process.env.WORKOS_CLIENT_ID = "client_test_usagemax";
    process.env.WORKOS_WEBHOOK_SECRET = secret;
    const timestamp = Date.now();
    const payload = JSON.stringify({
      id: "event_http_signature",
      event: "organization_membership.updated",
      created_at: new Date(timestamp).toISOString(),
      data: {
        id: "om_not_provisioned",
        object: "organization_membership",
        user_id: "user_not_provisioned",
        organization_id: "org_not_provisioned",
        organization_name: "Unprovisioned organization",
        status: "active",
        directory_managed: false,
        role: { slug: "member" },
        roles: [{ slug: "member" }],
        custom_attributes: {},
        created_at: new Date(timestamp).toISOString(),
        updated_at: new Date(timestamp).toISOString(),
      },
    });
    const invalid = await t.fetch("/v1/workos/events", {
      method: "POST",
      headers: { "content-type": "application/json", "workos-signature": `t=${timestamp}, v1=invalid` },
      body: payload,
    });
    expect(invalid.status).toBe(401);

    const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
    const valid = await t.fetch("/v1/workos/events", {
      method: "POST",
      headers: { "content-type": "application/json", "workos-signature": `t=${timestamp}, v1=${signature}` },
      body: payload,
    });
    expect(valid.status).toBe(200);
    await expect(valid.json()).resolves.toMatchObject({ ok: true, replay: false, outcome: "ignored_unprovisioned_organization" });
    delete process.env.WORKOS_CLIENT_ID;
    delete process.env.WORKOS_WEBHOOK_SECRET;
  });

  test("disables organization access immediately before batched membership cleanup", async () => {
    const admin = t.withIdentity({
      subject: "user_01DELETEDORG",
      issuer: "https://api.workos.com/",
      tokenIdentifier: "https://api.workos.com/|user_01DELETEDORG",
      org_id: "org_01DELETED",
      role: "admin",
      iat: 1_800_000_000,
    });
    await admin.mutation(api.account.ensureProfile, { handle: "deleted-org" });
    await expect(t.mutation(internal.workos.applyLifecycleEvent, {
      eventId: "event_org_deleted",
      eventName: "organization.deleted",
      organizationId: "org_01DELETED",
      roleSlugs: [],
      occurredAt: 1_800_000_001_000,
      now: 1_800_000_001_001,
    })).resolves.toEqual({ replay: false, outcome: "organization_deactivated" });
    expect((await admin.query(api.account.current, {}))?.workspace).toBeNull();
    await expect(admin.action(api.account.createCollector, { name: "Disabled" })).rejects.toThrow("PROFILE_REQUIRED");
  });
});
