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

    const rotated = await session.action(api.account.rotateCollector, { collectorId: created.collectorId });
    expect(rotated.token).not.toBe(created.token);
    account = await session.query(api.account.current, {});
    expect(account?.collectors[0]).toMatchObject({ name: "Quiet laptop", keyPrefix: rotated.keyPrefix });

    await session.mutation(api.account.revokeCollector, { collectorId: created.collectorId });
    account = await session.query(api.account.current, {});
    expect(account?.collectors[0]?.revokedAt).toBeTypeOf("number");
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
});
