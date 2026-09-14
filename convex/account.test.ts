import { beforeEach, describe, expect, test } from "vitest";
import { convexTest } from "convex-test";

import schema from "./schema";
import { api, internal } from "./_generated/api";

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

  test("does not let a new identity claim an imported profile by typing its handle", async () => {
    await t.mutation(internal.imports.begin, {
      handle: "established-builder",
      displayName: "Established Builder",
      sourceUrl: "https://example.com/profile",
      collectorKeyHash: "hash",
      collectorKeyPrefix: "prefix",
      now: Date.now(),
    });
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
});
