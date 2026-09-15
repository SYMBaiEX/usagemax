import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, test } from "vitest";
import { convexTest } from "convex-test";

import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

describe("WorkOS lifecycle events", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

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
