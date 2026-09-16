import { beforeEach, describe, expect, test } from "vitest";
import { convexTest } from "convex-test";

import schema from "./schema";
import { api, internal } from "./_generated/api";
import { sha256 } from "./lib";

const modules = import.meta.glob("./**/*.ts");

describe("WorkOS-backed accounts", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  test("creates a private profile for an authenticated identity", async () => {
    const session = t.withIdentity({
      subject: "user_01USAGEMAX",
      issuer: "https://api.workos.com/",
      tokenIdentifier: "https://api.workos.com/|user_01USAGEMAX",
      name: "Ada Builder",
      email: "ada@example.com",
      pictureUrl: "https://avatars.githubusercontent.com/u/1?v=4",
    });

    await expect(session.mutation(api.account.ensureProfile, { handle: "Ada-Builds" })).resolves.toEqual({
      handle: "ada-builds",
      created: true,
    });
    const account = await session.query(api.account.current, {});
    expect(account?.profile).toMatchObject({ handle: "ada-builds", isPublic: false, isVerified: false });
  });

  test("does not let a new identity claim another first-party profile handle", async () => {
    const owner = t.withIdentity({
      subject: "user_01OWNER",
      issuer: "https://api.workos.com/",
      tokenIdentifier: "https://api.workos.com/|user_01OWNER",
    });
    await owner.mutation(api.account.ensureProfile, { handle: "established-builder" });
    const session = t.withIdentity({
      subject: "user_01ATTACKER",
      issuer: "https://api.workos.com/",
      tokenIdentifier: "https://api.workos.com/|user_01ATTACKER",
    });
    await expect(session.mutation(api.account.ensureProfile, { handle: "established-builder" })).rejects.toThrow(
      "PROFILE_UNAVAILABLE",
    );
  });

  test("requires a verified session for account mutations", async () => {
    await expect(t.mutation(api.account.ensureProfile, { handle: "no-session" })).rejects.toThrow("AUTH_REQUIRED");
  });

  test("issues collector secrets once and supports rotation and revocation", async () => {
    const session = t.withIdentity({
      subject: "user_01COLLECTOR",
      issuer: "https://api.workos.com/",
      tokenIdentifier: "https://api.workos.com/|user_01COLLECTOR",
      name: "Collector Owner",
      email: "collector@example.com",
    });
    await session.mutation(api.account.ensureProfile, { handle: "collector-owner" });

    const created = await session.action(api.account.createCollector, { name: "Quiet laptop" });
    expect(created.token).toMatch(/^umx_[a-f0-9]{64}$/);
    let account = await session.query(api.account.current, {});
    expect(account?.collectors).toHaveLength(1);
    expect(account?.collectors[0]).toMatchObject({ name: "Quiet laptop", keyPrefix: created.keyPrefix });
    expect(account?.collectors[0]).not.toHaveProperty("keyHash");
    const collectorPage = await session.query(api.account.listCollectors, { paginationOpts: { numItems: 20, cursor: null } });
    expect(collectorPage.page).toHaveLength(1);
    expect(collectorPage.page[0]).toMatchObject({ name: "Quiet laptop", keyPrefix: created.keyPrefix });
    expect(collectorPage.page[0]).not.toHaveProperty("keyHash");

    const rotated = await session.action(api.account.rotateCollector, { collectorId: created.collectorId });
    expect(rotated.token).not.toBe(created.token);
    account = await session.query(api.account.current, {});
    expect(account?.collectors[0]).toMatchObject({ name: "Quiet laptop", keyPrefix: rotated.keyPrefix });

    await session.mutation(api.account.revokeCollector, { collectorId: created.collectorId });
    account = await session.query(api.account.current, {});
    expect(account?.collectors[0]?.revokedAt).toBeTypeOf("number");
  });

  test("emergency-revokes every active collector in one workspace", async () => {
    const session = t.withIdentity({
      subject: "user_01EMERGENCY",
      issuer: "https://api.workos.com/",
      tokenIdentifier: "https://api.workos.com/|user_01EMERGENCY",
      name: "Security Admin",
      email: "security@example.com",
    });
    await session.mutation(api.account.ensureProfile, { handle: "security-admin" });
    await session.action(api.account.createCollector, { name: "Production CI" });
    await session.action(api.account.createCollector, { name: "Compromised laptop" });

    const result = await session.mutation(api.account.revokeAllCollectors, {});
    expect(result).toEqual({ revoked: 2 });
    const account = await session.query(api.account.current, {});
    expect(account?.collectors).toHaveLength(2);
    expect(account?.collectors.every((collector) => typeof collector.revokedAt === "number")).toBe(true);

    const second = await session.mutation(api.account.revokeAllCollectors, {});
    expect(second).toEqual({ revoked: 0 });
  });

  test("exchanges a short-lived device code once without storing either plaintext secret", async () => {
    const session = t.withIdentity({
      subject: "user_01PAIRING",
      issuer: "https://api.workos.com/",
      tokenIdentifier: "https://api.workos.com/|user_01PAIRING",
      name: "Pairing Owner",
      email: "pairing@example.com",
    });
    await session.mutation(api.account.ensureProfile, { handle: "pairing-owner" });
    const link = await session.action(api.account.createDeviceLink, { name: "Studio PC" });
    expect(link.code).toMatch(/^UMX-[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){3}$/);
    expect(link.expiresAt).toBeGreaterThan(Date.now());

    const token = `umx_${"a".repeat(64)}`;
    const redeemed = await t.mutation(internal.account.redeemDeviceLink, {
      codeHash: await sha256(link.code),
      keyHash: await sha256(token),
      keyPrefix: token.slice(0, 12),
      name: "Studio PC",
      platform: "win32",
      cliVersion: "0.1.0",
      now: Date.now(),
    });
    expect(redeemed.handle).toBe("pairing-owner");
    expect(redeemed.deviceName).toBe("Studio PC");
    const account = await session.query(api.account.current, {});
    expect(account?.collectors[0]).toMatchObject({ name: "Studio PC", platform: "win32", cliVersion: "0.1.0" });
    expect(JSON.stringify(account)).not.toContain(token);
    await expect(t.mutation(internal.account.redeemDeviceLink, {
      codeHash: await sha256(link.code),
      keyHash: "replacement-hash",
      keyPrefix: "umx_replace",
      name: "Replay",
      now: Date.now(),
    })).rejects.toThrow("INVALID_LINK_CODE");
  });

  test("uses the name from the account link when the CLI does not override it", async () => {
    const session = t.withIdentity({
      subject: "user_01LINK_NAME",
      issuer: "https://api.workos.com/",
      tokenIdentifier: "https://api.workos.com/|user_01LINK_NAME",
    });
    await session.mutation(api.account.ensureProfile, { handle: "link-name" });
    const link = await session.action(api.account.createDeviceLink, { name: "Work laptop" });
    const token = `umx_${"b".repeat(64)}`;
    const redeemed = await t.mutation(internal.account.redeemDeviceLink, {
      codeHash: await sha256(link.code),
      keyHash: await sha256(token),
      keyPrefix: token.slice(0, 12),
      now: Date.now(),
    });
    expect(redeemed.deviceName).toBe("Work laptop");
    expect((await session.query(api.account.current, {}))?.collectors[0]?.name).toBe("Work laptop");
  });

  test("preserves the account name when an older CLI sends its Windows default", async () => {
    const session = t.withIdentity({
      subject: "user_01LEGACY_LINK_NAME",
      issuer: "https://api.workos.com/",
      tokenIdentifier: "https://api.workos.com/|user_01LEGACY_LINK_NAME",
    });
    await session.mutation(api.account.ensureProfile, { handle: "legacy-link-name" });
    const link = await session.action(api.account.createDeviceLink, { name: "Work laptop" });
    const token = `umx_${"c".repeat(64)}`;
    const redeemed = await t.mutation(internal.account.redeemDeviceLink, {
      codeHash: await sha256(link.code),
      keyHash: await sha256(token),
      keyPrefix: token.slice(0, 12),
      name: "Windows PC",
      platform: "win32",
      cliVersion: "0.3.3",
      now: Date.now(),
    });
    expect(redeemed.deviceName).toBe("Work laptop");
    expect((await session.query(api.account.current, {}))?.collectors[0]?.name).toBe("Work laptop");
  });

  test("relinks one installation by rotating its collector instead of duplicating it", async () => {
    const session = t.withIdentity({
      subject: "user_01STABLE_DEVICE",
      issuer: "https://api.workos.com/",
      tokenIdentifier: "https://api.workos.com/|user_01STABLE_DEVICE",
    });
    await session.mutation(api.account.ensureProfile, { handle: "stable-device" });
    const installationIdHash = await sha256("machine-local-random-id");
    const firstLink = await session.action(api.account.createDeviceLink, { name: "Original name" });
    const first = await t.mutation(internal.account.redeemDeviceLink, {
      codeHash: await sha256(firstLink.code),
      keyHash: "first-key-hash",
      keyPrefix: "umx_first",
      name: "Original name",
      installationIdHash,
      now: Date.now(),
    });
    const secondLink = await session.action(api.account.createDeviceLink, { name: "Renamed in UI" });
    const second = await t.mutation(internal.account.redeemDeviceLink, {
      codeHash: await sha256(secondLink.code),
      keyHash: "second-key-hash",
      keyPrefix: "umx_second",
      name: "Renamed in UI",
      installationIdHash,
      now: Date.now() + 1,
    });
    expect(second.collectorId).toBe(first.collectorId);
    const account = await session.query(api.account.current, {});
    expect(account?.collectors).toHaveLength(1);
    expect(account?.collectors[0]).toMatchObject({ name: "Renamed in UI", keyPrefix: "umx_second" });
  });

  test("restores only request-revoked collectors when deletion is cancelled", async () => {
    const session = t.withIdentity({
      subject: "user_01RECOVERY",
      issuer: "https://api.workos.com/",
      tokenIdentifier: "https://api.workos.com/|user_01RECOVERY",
    });
    await session.mutation(api.account.ensureProfile, { handle: "recovery-owner" });
    const collector = await session.action(api.account.createCollector, { name: "Recovery collector" });
    const request = await session.mutation(api.account.requestAccountDeletion, { confirmation: "delete my account" });
    expect(request.scheduledFor).toBeGreaterThan(Date.now());
    expect((await session.query(api.account.current, {}))?.collectors[0]?.revokedAt).toBeTypeOf("number");
    await expect(session.mutation(api.account.cancelAccountDeletion, {})).resolves.toEqual({ cancelled: true });
    const restored = (await session.query(api.account.current, {}))?.collectors[0];
    expect(restored).toMatchObject({ id: collector.collectorId });
    expect(restored).not.toHaveProperty("revokedAt");
  });

  test("isolates personal and WorkOS organization workspaces for the same user", async () => {
    const baseIdentity = {
      subject: "user_01MULTITENANT",
      issuer: "https://api.workos.com/",
      tokenIdentifier: "https://api.workos.com/|user_01MULTITENANT",
      name: "Multi Tenant Admin",
      email: "admin@example.com",
    };
    const personal = t.withIdentity(baseIdentity);
    await personal.mutation(api.account.ensureProfile, { handle: "personal-usage" });

    const organization = t.withIdentity({
      ...baseIdentity,
      org_id: "org_01ENTERPRISE",
      role: "admin",
      roles: ["admin"],
      permissions: ["workspace:manage", "profile:manage", "collectors:manage", "data:export"],
    });
    await organization.mutation(api.account.ensureProfile, { handle: "acme-usage" });

    expect((await personal.query(api.account.current, {}))?.profile?.handle).toBe("personal-usage");
    const orgAccount = await organization.query(api.account.current, {});
    expect(orgAccount?.profile?.handle).toBe("acme-usage");
    expect(orgAccount?.workspace).toMatchObject({ kind: "organization", role: "admin", plan: "team" });
    expect(orgAccount?.capabilities["collectors:manage"]).toBe(true);
  });

  test("uses current WorkOS role claims to enforce organization permissions", async () => {
    const admin = t.withIdentity({
      subject: "user_01ORGADMIN",
      issuer: "https://api.workos.com/",
      tokenIdentifier: "https://api.workos.com/|user_01ORGADMIN",
      org_id: "org_01RBAC",
      role: "admin",
    });
    await admin.mutation(api.account.ensureProfile, { handle: "rbac-workspace" });

    const member = t.withIdentity({
      subject: "user_01ORGMEMBER",
      issuer: "https://api.workos.com/",
      tokenIdentifier: "https://api.workos.com/|user_01ORGMEMBER",
      org_id: "org_01RBAC",
      role: "member",
    });
    await expect(member.mutation(api.account.ensureProfile, { handle: "ignored-handle" })).resolves.toEqual({
      handle: "rbac-workspace",
      created: false,
    });
    expect((await member.query(api.account.current, {}))?.capabilities["profile:manage"]).toBe(false);
    await expect(member.mutation(api.account.updateProfile, { displayName: "Escalated", bio: "" })).rejects.toThrow("FORBIDDEN");
    await expect(member.action(api.account.createCollector, { name: "My device" })).resolves.toHaveProperty("token");
    await expect(member.query(api.account.auditLog, { paginationOpts: { numItems: 25, cursor: null } })).rejects.toThrow("FORBIDDEN");

    const delegated = t.withIdentity({
      subject: "user_01ORGMEMBER",
      issuer: "https://api.workos.com/",
      tokenIdentifier: "https://api.workos.com/|user_01ORGMEMBER",
      org_id: "org_01RBAC",
      role: "member",
      permissions: ["collectors:manage"],
    });
    await expect(delegated.action(api.account.createCollector, { name: "Delegated collector" })).resolves.toMatchObject({
      keyPrefix: expect.stringMatching(/^umx_/),
    });
    await expect(admin.action(api.account.exportAccount, {})).resolves.toMatchObject({
      profile: { handle: "rbac-workspace" },
    });
    const audit = await admin.query(api.account.auditLog, { paginationOpts: { numItems: 25, cursor: null } });
    expect(audit.page.map((event) => event.action)).toEqual(expect.arrayContaining([
      "profile.created",
      "collector.created",
      "workspace.exported",
    ]));
  });

  test("does not let an unprovisioned organization member claim a workspace", async () => {
    const member = t.withIdentity({
      subject: "user_01UNPROVISIONED",
      issuer: "https://api.workos.com/",
      tokenIdentifier: "https://api.workos.com/|user_01UNPROVISIONED",
      org_id: "org_01UNKNOWN",
      role: "member",
    });
    await expect(member.mutation(api.account.ensureProfile, { handle: "unclaimed-company" })).rejects.toThrow(
      "ORGANIZATION_NOT_PROVISIONED",
    );
  });

  test("treats explicit WorkOS permissions as authoritative", async () => {
    const session = t.withIdentity({
      subject: "user_01LIMITEDADMIN",
      issuer: "https://api.workos.com/",
      tokenIdentifier: "https://api.workos.com/|user_01LIMITEDADMIN",
      org_id: "org_01LIMITED",
      role: "admin",
      permissions: ["workspace:manage", "profile:manage"],
    });
    await session.mutation(api.account.ensureProfile, { handle: "limited-admin" });
    const account = await session.query(api.account.current, {});
    expect(account?.capabilities["profile:manage"]).toBe(true);
    expect(account?.capabilities["collectors:manage"]).toBe(false);
    await expect(session.action(api.account.createCollector, { name: "Denied collector" })).rejects.toThrow("FORBIDDEN");
  });

  test("rejects collector controls across WorkOS organization boundaries", async () => {
    const first = t.withIdentity({
      subject: "user_01TENANTA",
      issuer: "https://api.workos.com/",
      tokenIdentifier: "https://api.workos.com/|user_01TENANTA",
      org_id: "org_01TENANTA",
      role: "admin",
    });
    const second = t.withIdentity({
      subject: "user_01TENANTB",
      issuer: "https://api.workos.com/",
      tokenIdentifier: "https://api.workos.com/|user_01TENANTB",
      org_id: "org_01TENANTB",
      role: "admin",
    });
    await first.mutation(api.account.ensureProfile, { handle: "tenant-a" });
    await second.mutation(api.account.ensureProfile, { handle: "tenant-b" });
    const foreignCollector = await second.action(api.account.createCollector, { name: "Tenant B collector" });

    await expect(first.action(api.account.rotateCollector, { collectorId: foreignCollector.collectorId })).rejects.toThrow(
      "COLLECTOR_NOT_FOUND",
    );
    await expect(first.mutation(api.account.renameCollector, {
      collectorId: foreignCollector.collectorId,
      name: "Cross-tenant rename",
    })).rejects.toThrow("COLLECTOR_NOT_FOUND");
    await expect(first.mutation(api.account.revokeCollector, { collectorId: foreignCollector.collectorId })).rejects.toThrow(
      "COLLECTOR_NOT_FOUND",
    );
  });
});
