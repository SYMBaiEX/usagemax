import { describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const identity = {
  subject: "user_lifecycle",
  issuer: "https://api.workos.com/",
  tokenIdentifier: "https://api.workos.com/|user_lifecycle",
};

describe("workspace lifecycle and import safety", () => {
  test("provider dispatch caps leases and retries only transient failures", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      const session = t.withIdentity({ ...identity, org_id: "org_queue", role: "owner" });
      await session.mutation(api.account.ensureProfile, { handle: "queue-owner" });
      const overview = await session.query(api.workspaces.overview, {});
      const ids = await t.run(async ctx => {
        await ctx.db.patch(overview.workspace.id, { plan: "enterprise" });
        return await Promise.all(Array.from({ length: 25 }, (_, i) => ctx.db.insert("providerConnections", {
          workspaceId: overview.workspace.id, provider: "github", name: `Fixture ${i}`, accountId: `fixture-${i}`,
          secretCiphertext: "fixture", secretIv: "fixture", keyVersion: "v1", state: "connected", nextSyncAt: Date.now() - i,
          coverageNote: "test", createdBy: overview.userId, createdAt: Date.now(),
        })));
      });
      await t.mutation(internal.connections.dispatch, {});
      await t.mutation(internal.connections.dispatch, {});
      await t.mutation(internal.connections.dispatch, {});
      const rows = await t.run(ctx => ctx.db.query("providerConnections").collect());
      expect(rows.filter(row => row.syncLeaseId)).toHaveLength(20);
      const leased = rows.find(row => row.syncLeaseId)!;
      await t.mutation(internal.connections.finish, { id: leased._id, leaseId: leased.syncLeaseId!, day: "2026-09-01", error: "PROVIDER_HTTP_429", retryable: true, retryAfterMs: 120_000 });
      const retried = await t.run(ctx => ctx.db.get(leased._id));
      expect(retried).toMatchObject({ state: "connected", consecutiveFailures: 1 });
      expect(retried!.nextSyncAt).toBeGreaterThanOrEqual(Date.now() + 120_000);
      expect(retried!.syncLeaseId).toBeUndefined();
      await t.run(ctx => ctx.db.patch(ids[0], { syncLeaseId: "permanent" }));
      await t.mutation(internal.connections.finish, { id: ids[0], leaseId: "permanent", day: "2026-09-01", error: "PROVIDER_HTTP_401", retryable: false });
      expect((await t.run(ctx => ctx.db.get(ids[0])))?.state).toBe("error");
      await t.run(ctx => ctx.db.patch(ids[1], { syncLeaseId: "exhausted", consecutiveFailures: 8 }));
      await t.mutation(internal.connections.finish, { id: ids[1], leaseId: "exhausted", day: "2026-09-01", error: "PROVIDER_HTTP_503", retryable: true });
      expect((await t.run(ctx => ctx.db.get(ids[1])))?.state).toBe("error");
      await t.run(ctx => ctx.db.patch(ids[2], { state: "connected", syncLeaseId: "progress", syncPage: 1, consecutiveFailures: 8, lastError: "PROVIDER_HTTP_503" }));
      await t.mutation(internal.connections.finish, { id: ids[2], leaseId: "progress", day: "2026-09-01", page: 1, hasMore: true, seen: 500, expected: 600, costMicros: 20 });
      expect(await t.run(ctx => ctx.db.get(ids[2]))).toMatchObject({ consecutiveFailures: 0 });
      await t.mutation(internal.connections.finish, { id: ids[2], leaseId: "progress", day: "2026-09-01", error: "PROVIDER_HTTP_503", retryable: true });
      expect(await t.run(ctx => ctx.db.get(ids[2]))).toMatchObject({ state: "connected", consecutiveFailures: 1 });
      // Deliberately do not execute synthetic scheduled network actions.
    } finally { vi.useRealTimers(); }
  });
  test("reconciled invitation onboarding runs once and cannot undo later team removal", async () => {
    const t = convexTest(schema, modules);
    const session = t.withIdentity({
      ...identity,
      email: "owner@example.com",
      org_id: "org_invitation_lifecycle",
      role: "owner",
    });
    await session.mutation(api.account.ensureProfile, {
      handle: "invite-life",
    });
    const overview = await session.query(api.workspaces.overview, {});
    const teamId = await session.mutation(api.workspaces.createTeam, {
      name: "Engineering",
      description: "",
    });
    const invitationId = await t.run((ctx) =>
      ctx.db.insert("workspaceInvitations", {
        workspaceId: overview.workspace.id,
        externalId: "invitation_already_accepted",
        email: "owner@example.com",
        role: "member",
        teamId,
        state: "accepted",
        expiresAt: Date.now() - 1000,
        invitedBy: overview.userId,
        createdAt: Date.now() - 86400000,
        updatedAt: Date.now(),
      }),
    );
    await session.mutation(api.workspaces.bootstrap, {});
    expect(
      (await t.run((ctx) => ctx.db.get(invitationId)))?.onboardingAppliedAt,
    ).toBeGreaterThan(0);
    expect(
      (
        await session.query(api.workspaces.teamMembers, {
          teamId,
          paginationOpts: { numItems: 10, cursor: null },
        })
      ).page,
    ).toHaveLength(1);
    await session.mutation(api.workspaces.setTeamMember, {
      teamId,
      memberUserId: overview.userId,
      manager: false,
      remove: true,
    });
    await session.mutation(api.workspaces.bootstrap, {});
    expect(
      (
        await session.query(api.workspaces.teamMembers, {
          teamId,
          paginationOpts: { numItems: 10, cursor: null },
        })
      ).page,
    ).toHaveLength(0);
  });

  test("personal selection never grants access to a different company", async () => {
    const t = convexTest(schema, modules);
    const personal = t.withIdentity(identity);
    await personal.mutation(api.account.ensureProfile, {
      handle: "personal-life",
    });
    const company = t.withIdentity({
      ...identity,
      org_id: "org_lifecycle",
      role: "admin",
    });
    await company.mutation(api.account.ensureProfile, {
      handle: "company-life",
    });
    const restricted = t.withIdentity({
      ...identity,
      org_id: "org_lifecycle",
      role: "member",
      permissions: ["collectors:self"],
    });
    await expect(restricted.query(api.personal.summary, {})).rejects.toThrow(
      "FORBIDDEN",
    );
    await restricted.mutation(api.workspaces.selectPersonal, {
      personal: true,
    });
    const exportWorkspace = (
      await restricted.query(api.workspaces.overview, {})
    ).workspace.id;
    expect(
      (await restricted.query(api.account.current, {}))?.profile?.handle,
    ).toBe("personal-life");
    expect((await restricted.query(api.personal.summary, {})).personal).toBe(
      true,
    );
    await restricted.mutation(api.workspaces.selectPersonal, {
      personal: false,
    });
    expect(
      (await restricted.query(api.account.current, {}))?.profile?.handle,
    ).toBe("company-life");
    await expect(restricted.query(api.personal.summary, {})).rejects.toThrow(
      "FORBIDDEN",
    );
    await expect(
      company.query(api.personal.exportPage, {
        dataset: "daily",
        expectedWorkspaceId: exportWorkspace,
        paginationOpts: { numItems: 10, cursor: null },
      }),
    ).rejects.toThrow("EXPORT_WORKSPACE_CHANGED_RESTART");
    const unjoined = t.withIdentity({
      ...identity,
      org_id: "org_not_joined",
      role: "owner",
    });
    await expect(unjoined.query(api.workspaces.overview, {})).rejects.toThrow(
      "PROFILE_REQUIRED",
    );
  });

  test("provider checkpoints commit once, hide credentials, and disconnect invalidates in-flight results", async () => {
    const t = convexTest(schema, modules);
    const session = t.withIdentity({
      ...identity,
      org_id: "org_lifecycle",
      role: "owner",
    });
    await session.mutation(api.account.ensureProfile, {
      handle: "provider-life",
    });
    const overview = await session.query(api.workspaces.overview, {});
    const id = await t.run(async (ctx) => {
      await ctx.db.patch(overview.workspace.id, { plan: "enterprise" });
      return await ctx.db.insert("providerConnections", {
        workspaceId: overview.workspace.id,
        provider: "cursor",
        name: "Cursor",
        accountId: "company",
        secretCiphertext: "never-return-me",
        secretIv: "iv",
        keyVersion: "v1",
        state: "connected",
        syncDay: "2026-09-01",
        nextSyncAt: Date.now(),
        syncLeaseId: "lease",
        syncLeaseUntil: Date.now() + 120_000,
        coverageNote: "Chargeable usage only",
        createdBy: overview.userId,
        createdAt: Date.now(),
      });
    });
    expect(
      JSON.stringify(await session.query(api.connections.list, {})),
    ).not.toContain("never-return-me");
    const partial = {
      id,
      leaseId: "lease",
      day: "2026-09-01",
      costMicros: 100,
      page: 1,
      seen: 500,
      expected: 600,
      hasMore: true,
    };
    await t.mutation(internal.connections.finish, partial);
    await t.mutation(internal.connections.finish, partial); // Same page replay is inert.
    expect((await t.run((ctx) => ctx.db.get(id)))?.syncPage).toBe(2);
    expect(
      await t.run((ctx) => ctx.db.query("financialEntries").collect()),
    ).toHaveLength(0);
    await t.mutation(internal.connections.finish, {
      ...partial,
      costMicros: 120,
      page: 2,
      seen: 600,
      hasMore: false,
    });
    await t.mutation(internal.connections.finish, {
      ...partial,
      costMicros: 120,
      page: 2,
      seen: 600,
      hasMore: false,
    });
    expect(
      await t.run((ctx) => ctx.db.query("financialEntries").collect()),
    ).toHaveLength(1);
    expect(
      (await t.run((ctx) => ctx.db.query("financialMonthly").first()))
        ?.amountMicros,
    ).toBe(120);
    await t.run((ctx) => ctx.db.patch(id, { syncLeaseId: "late" }));
    await session.mutation(api.connections.disconnect, { id });
    await t.mutation(internal.connections.finish, {
      id,
      leaseId: "late",
      day: "2026-09-02",
      costMicros: 999,
    });
    expect(
      await t.run((ctx) => ctx.db.query("financialEntries").collect()),
    ).toHaveLength(1);
    expect((await t.run((ctx) => ctx.db.get(id)))?.secretCiphertext).toBe("");
  });

  test("quiet coverage alerts do not repeat while the last upload is unchanged", async () => {
    const t = convexTest(schema, modules);
    const session = t.withIdentity(identity);
    await session.mutation(api.account.ensureProfile, {
      handle: "coverage-life",
    });
    const device = await session.action(api.account.createCollector, {
      name: "Offline laptop",
    });
    await t.run((ctx) =>
      ctx.db.patch(device.collectorId, {
        lastSuccessAt: Date.now() - 72 * 3_600_000,
      }),
    );
    await t.mutation(internal.coverageAlerts.check, {});
    await t.mutation(internal.coverageAlerts.check, {});
    expect(
      await t.run((ctx) => ctx.db.query("notifications").collect()),
    ).toHaveLength(1);
  });

  test("telemetry retention respects workspace windows and does not touch totals", async () => {
    const t = convexTest(schema, modules);
    const session = t.withIdentity(identity);
    await session.mutation(api.account.ensureProfile, {
      handle: "retention-life",
    });
    const overview = await session.query(api.workspaces.overview, {});
    const old = Date.now() - 45 * 86_400_000;
    const id = await t.run(async (ctx) => {
      const profile = (await ctx.db.query("profiles").first())!;
      await ctx.db.patch(overview.workspace.id, { retentionDays: 90 });
      return await ctx.db.insert("telemetryEvents", {
        workspaceId: overview.workspace.id,
        profileId: profile._id,
        eventKey: "old-event",
        eventHash: "old-hash",
        eventType: "model_request",
        source: "test",
        provider: "openai",
        model: "gpt-test",
        inputTokens: 1,
        outputTokens: 1,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        totalTokens: 2,
        costMicros: 1,
        costBasis: "reported",
        status: "ok",
        occurredAt: old,
        receivedAt: old,
        schemaVersion: 1,
        completeness: "reported",
      });
    });
    await t.mutation(internal.retention.trim, {
      workspaceId: overview.workspace.id,
    });
    expect(await t.run((ctx) => ctx.db.get(id))).not.toBeNull();
    const before = await session.query(api.personal.summary, {});
    await t.run((ctx) =>
      ctx.db.patch(overview.workspace.id, { retentionDays: 30 }),
    );
    await t.mutation(internal.retention.trim, {
      workspaceId: overview.workspace.id,
    });
    expect(await t.run((ctx) => ctx.db.get(id))).toBeNull();
    expect((await session.query(api.personal.summary, {})).stats).toEqual(
      before.stats,
    );
  });

  test("deletion clears new personal product records and preferences", async () => {
    const t = convexTest(schema, modules);
    const session = t.withIdentity(identity);
    await session.mutation(api.account.ensureProfile, {
      handle: "deletion-life",
    });
    await session.mutation(api.personal.savePreferences, {
      timezone: "UTC",
      defaultRange: "all",
      weekStartsOn: "monday",
      notificationCoverage: true,
      notificationBudgets: true,
    });
    await session.mutation(api.personal.saveView, {
      name: "History",
      startDay: "2024-01-01",
      endDay: "2024-12-31",
    });
    await session.mutation(api.workspaces.createTeam, {
      name: "Side projects",
      description: "",
    });
    await session.mutation(api.account.requestAccountDeletion, {
      confirmation: "delete my account",
    });
    const request = await t.run(async (ctx) => {
      const row = (await ctx.db.query("accountDeletionRequests").first())!;
      await ctx.db.patch(row._id, { scheduledFor: Date.now() - 1 });
      return row;
    });
    for (let i = 0; i < 80; i++) {
      await t.mutation(internal.account.processAccountDeletion, {
        requestId: request._id,
      });
      if ((await t.run((ctx) => ctx.db.get(request._id)))?.completedAt) break;
    }
    expect(
      (await t.run((ctx) => ctx.db.get(request._id)))?.completedAt,
    ).toBeTypeOf("number");
    expect(await t.run((ctx) => ctx.db.query("savedViews").collect())).toEqual(
      [],
    );
    expect(await t.run((ctx) => ctx.db.query("teams").collect())).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("teamMembers").collect())).toEqual(
      [],
    );
    expect(await t.run((ctx) => ctx.db.query("preferences").collect())).toEqual(
      [],
    );
  });
});
