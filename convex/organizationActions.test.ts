import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import schema from "./schema";
import { api } from "./_generated/api";

const mocks = vi.hoisted(() => ({
  createOrganization: vi.fn(),
  listMemberships: vi.fn(),
  createMembership: vi.fn(),
  sendInvitation: vi.fn(),
  listInvitations: vi.fn(),
}));
vi.mock("@workos-inc/node", () => ({
  WorkOS: class {
    organizations = { createOrganization: mocks.createOrganization };
    userManagement = {
      listOrganizationMemberships: mocks.listMemberships,
      createOrganizationMembership: mocks.createMembership,
      sendInvitation: mocks.sendInvitation,
      listInvitations: mocks.listInvitations,
    };
  },
}));
const modules = import.meta.glob("./**/*.ts");
const identity = {
  subject: "user_workos_test",
  tokenIdentifier: "https://api.workos.com/|user_workos_test",
  issuer: "https://api.workos.com/",
  email: "owner@example.com",
};
describe("WorkOS orchestration without external calls", () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("WORKOS_API_KEY", "fixture-only");
  });
  test("organization creation replays the same operation without creating duplicates", async () => {
    const t = convexTest(schema, modules);
    rateLimiterTest.register(t);
    const session = t.withIdentity(identity);
    await session.mutation(api.account.ensureProfile, {
      handle: "org-test-personal",
    });
    mocks.createOrganization.mockResolvedValue({ id: "org_fixture" });
    mocks.listMemberships.mockResolvedValue({ data: [] });
    mocks.createMembership.mockResolvedValue({ id: "membership_fixture" });
    const args = {
      name: "Fixture company",
      requestId: "12345678-1234-1234-1234-123456789012",
    };
    const first = await session.action(api.organizationActions.create, args);
    const replay = await session.action(api.organizationActions.create, args);
    expect(first).toEqual(replay);
    expect(mocks.createOrganization).toHaveBeenCalledTimes(1);
    expect(mocks.createMembership).toHaveBeenCalledTimes(1);
    const workspaces = await t.run((ctx) =>
      ctx.db.query("workspaces").collect(),
    );
    expect(
      workspaces.filter((w) => w.workosOrganizationId === "org_fixture"),
    ).toHaveLength(1);
    expect(
      workspaces.find((w) => w.workosOrganizationId === "org_fixture"),
    ).toMatchObject({ isPublic: false, plan: "free" });
  });
  test("an uncertain invitation keeps its reservation and supports read-only delivery reconciliation", async () => {
    const t = convexTest(schema, modules);
    rateLimiterTest.register(t);
    const session = t.withIdentity({
      ...identity,
      org_id: "org_fixture",
      role: "owner",
    });
    await session.mutation(api.account.ensureProfile, {
      handle: "org-test-invites",
    });
    mocks.sendInvitation.mockRejectedValue(new Error("network timeout"));
    await expect(
      session.action(api.organizationActions.invite, {
        email: "member@example.com",
        role: "member",
      }),
    ).rejects.toThrow("INVITATION_SEND_FAILED");
    const row = (await t.run((ctx) =>
      ctx.db.query("workspaceInvitations").first(),
    ))!;
    expect(row.state).toBe("pending");
    await expect(
      session.action(api.organizationActions.invite, {
        email: "member@example.com",
        role: "member",
      }),
    ).rejects.toThrow("INVITATION_ALREADY_PENDING");
    expect(mocks.sendInvitation).toHaveBeenCalledTimes(1);
    mocks.listInvitations.mockResolvedValue({
      data: [
        {
          id: "invitation_fixture",
          organizationId: "org_fixture",
          email: "member@example.com",
          createdAt: new Date(row.createdAt).toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          state: "pending",
        },
      ],
    });
    await session.action(api.organizationActions.manageInvitation, {
      id: row._id,
      operation: "reconcile",
    });
    expect(await t.run((ctx) => ctx.db.get(row._id))).toMatchObject({
      externalId: "invitation_fixture",
      state: "pending",
    });
  });
});
