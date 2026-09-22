import { beforeEach, describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import type { FunctionReturnType } from "convex/server";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { centsToMicros } from "./providerMath";
import { productPolicy, safeCsvCell } from "./productPolicy";
import { assertCollectorMembership } from "./collectorAccess";

const modules = import.meta.glob("./**/*.ts");
const identity = (name: string, org?: string, role = "owner") => ({
  subject: `user_${name}`,
  issuer: "https://api.workos.com/",
  tokenIdentifier: `https://api.workos.com/|user_${name}`,
  name,
  email: `${name}@example.com`,
  ...(org ? { org_id: org, role } : {}),
});
const entry = (key = "invoice-1", amountMicros = 2_000_000) => ({
  externalKey: key,
  provider: "anthropic",
  account: "test",
  day: new Date().toISOString().slice(0, 10),
  currency: "USD",
  amountMicros,
  kind: "usage" as const,
  basis: "billed" as const,
  note: "test invoice",
});
const page = { numItems: 100, cursor: null };

describe("free personal and enterprise controls", () => {
  let t: ReturnType<typeof convexTest>;
  beforeEach(() => {
    t = convexTest(schema, modules);
  });
  async function owner(name = "owner", org?: string) {
    const session = t.withIdentity(identity(name, org));
    await session.mutation(api.account.ensureProfile, {
      handle: `${name}-usage`,
    });
    return session;
  }
  test("free product keeps privacy, history and export without paid entitlements", () => {
    expect(productPolicy("free")).toMatchObject({
      enterprise: false,
      members: 10,
      devices: 25,
      history: true,
      exports: true,
    });
    expect(productPolicy("enterprise").enterprise).toBe(true);
    expect(productPolicy("pro")).toMatchObject({
      enterprise: false,
      tier: "team",
      members: 100,
      devices: 250,
      budgets: 50,
    });
  });
  test("requires authentication for private surfaces", async () => {
    await expect(t.query(api.workspaces.overview, {})).rejects.toThrow(
      "AUTH_REQUIRED",
    );
    await expect(t.query(api.personal.summary, {})).rejects.toThrow(
      "AUTH_REQUIRED",
    );
    await expect(
      t.query(api.finance.entries, {
        startDay: "2024-01-01",
        endDay: "2026-12-31",
        paginationOpts: page,
      }),
    ).rejects.toThrow("AUTH_REQUIRED");
  });
  test("financial replay and corrections never inflate collector tokens", async () => {
    const session = await owner();
    const before = await session.query(api.personal.summary, {});
    expect(
      await session.mutation(api.finance.record, { entries: [entry()] }),
    ).toEqual({ received: 1, changed: 1 });
    expect(
      await session.mutation(api.finance.record, { entries: [entry()] }),
    ).toEqual({ received: 1, changed: 0 });
    await session.mutation(api.finance.record, {
      entries: [entry("invoice-1", 3_000_000)],
    });
    const result = await session.query(api.finance.summary, {
      month: entry().day.slice(0, 7),
    });
    expect(result.totals).toHaveLength(1);
    expect(result.totals[0]).toMatchObject({
      amountMicros: 3_000_000,
      entries: 1,
    });
    expect(
      (await session.query(api.personal.summary, {})).stats?.totalTokens,
    ).toBe(before.stats?.totalTokens);
  });
  test("keeps currencies and evidence bases distinct", async () => {
    const session = await owner();
    await session.mutation(api.finance.record, {
      entries: [
        entry(),
        { ...entry("reported", 1_000_000), basis: "reported" },
        { ...entry("eur", 4_000_000), currency: "EUR" },
      ],
    });
    const totals = await session.query(api.finance.summary, {
      month: entry().day.slice(0, 7),
    });
    expect(totals.totals).toHaveLength(3);
    const result = await session.query(api.finance.reconciliation, {
      month: entry().day.slice(0, 7),
      currency: "USD",
    });
    expect(result).toMatchObject({
      differenceMicros: 1_000_000,
      status: "needs_review",
    });
  });
  test("rejects unsafe amounts, future dates, positive credits and oversized imports", async () => {
    const session = await owner();
    for (const row of [
      { ...entry(), amountMicros: 1.5 },
      { ...entry(), amountMicros: Number.MAX_SAFE_INTEGER },
      { ...entry(), day: "2026-02-31" },
      { ...entry(), kind: "credit" as const },
    ])
      await expect(
        session.mutation(api.finance.record, { entries: [row] }),
      ).rejects.toThrow();
    await expect(
      session.mutation(api.finance.record, {
        entries: Array.from({ length: 51 }, (_, i) => entry(String(i))),
      }),
    ).rejects.toThrow("IMPORT_BATCH_LIMIT");
  });
  test("cross-tenant ledger allocation is denied", async () => {
    const a = await owner("alpha");
    const b = await owner("bravo");
    const project = await b.mutation(api.workspaces.saveProject, {
      name: "Secret",
      key: "secret",
      costCenter: "x",
      archived: false,
    });
    await a.mutation(api.finance.record, { entries: [entry()] });
    const rows = await a.query(api.finance.entries, {
      startDay: "2020-01-01",
      endDay: "2030-01-01",
      paginationOpts: page,
    });
    await expect(
      a.mutation(api.finance.allocate, {
        entryId: rows.page[0]._id,
        projectId: project,
      }),
    ).rejects.toThrow("PROJECT_NOT_FOUND");
    await expect(
      b.mutation(api.finance.remove, { entryId: rows.page[0]._id }),
    ).rejects.toThrow("MANUAL_ENTRY_NOT_FOUND");
  });
  test("manual deletion reverses financial rollups", async () => {
    const session = await owner();
    await session.mutation(api.finance.record, { entries: [entry()] });
    const rows = await session.query(api.finance.entries, {
      startDay: "2020-01-01",
      endDay: "2030-01-01",
      paginationOpts: page,
    });
    await session.mutation(api.finance.remove, { entryId: rows.page[0]._id });
    expect(
      (
        await session.query(api.finance.summary, {
          month: entry().day.slice(0, 7),
        })
      ).totals,
    ).toEqual([]);
  });
  test("budget alerts deduplicate and distinguish missing data from zero", async () => {
    const session = await owner();
    const budget = await session.mutation(api.budgets.save, {
      name: "Month",
      limitMicros: 1_000_000,
      currency: "USD",
      source: "ledger",
      basis: "billed",
      thresholdPercent: 80,
      enabled: true,
    });
    expect(
      (await session.query(api.budgets.list, {}))[0].observedMicros,
    ).toBeUndefined();
    await session.mutation(api.finance.record, { entries: [entry()] });
    await t.mutation(internal.budgets.evaluateAll, {});
    await t.mutation(internal.budgets.evaluateAll, {});
    const notices = await session.query(api.personal.notifications, {
      paginationOpts: page,
    });
    expect(notices.page).toHaveLength(1);
    expect((await session.query(api.budgets.list, {}))[0]).toMatchObject({
      _id: budget,
      observedMicros: 2_000_000,
    });
  });
  test("notification preference suppresses budget alerts", async () => {
    const session = await owner();
    await session.mutation(api.personal.savePreferences, {
      timezone: "America/Chicago",
      weekStartsOn: "monday",
      defaultRange: "all",
      notificationBudgets: false,
      notificationCoverage: true,
    });
    await session.mutation(api.finance.record, { entries: [entry()] });
    await session.mutation(api.budgets.save, {
      name: "Quiet",
      limitMicros: 1_000_000,
      currency: "USD",
      source: "ledger",
      basis: "billed",
      thresholdPercent: 80,
      enabled: true,
    });
    expect(
      (
        await session.query(api.personal.notifications, {
          paginationOpts: page,
        })
      ).page,
    ).toEqual([]);
    await expect(
      session.mutation(api.personal.savePreferences, {
        timezone: "bad/timezone",
        weekStartsOn: "monday",
        defaultRange: "all",
        notificationBudgets: false,
        notificationCoverage: true,
      }),
    ).rejects.toThrow("INVALID_TIMEZONE");
  });
  test("saved views are private and enforce the free capacity limit", async () => {
    const a = await owner("alpha");
    const b = await owner("bravo");
    const view = await a.mutation(api.personal.saveView, {
      name: "2024",
      startDay: "2024-01-01",
      endDay: "2024-12-31",
    });
    await expect(
      b.mutation(api.personal.removeView, { id: view }),
    ).rejects.toThrow("VIEW_NOT_FOUND");
    for (let i = 1; i < 30; i++)
      await a.mutation(api.personal.saveView, {
        name: `v${i}`,
        startDay: "2024-01-01",
        endDay: "2024-12-31",
      });
    await expect(
      a.mutation(api.personal.saveView, {
        name: "overflow",
        startDay: "2024-01-01",
        endDay: "2024-12-31",
      }),
    ).rejects.toThrow("SAVED_VIEW_LIMIT");
  });
  test("company data cannot be published", async () => {
    const session = await owner("company", "org_company");
    await expect(
      session.mutation(api.account.setProfileVisibility, { isPublic: true }),
    ).rejects.toThrow("COMPANY_DATA_IS_PRIVATE");
  });
  test("members may enroll their own devices, never rotate another member's", async () => {
    const admin = await owner("admin", "org_company");
    const adminDevice = await admin.action(api.account.createCollector, {
      name: "Admin device",
    });
    const member = t.withIdentity(identity("member", "org_company", "member"));
    await member.mutation(api.workspaces.bootstrap, {});
    const own = await member.action(api.account.createCollector, {
      name: "Member device",
    });
    const visible = await member.query(api.account.listCollectors, {
      paginationOpts: page,
    });
    expect(visible.page.map((d) => d.id)).toEqual([own.collectorId]);
    await expect(
      member.action(api.account.rotateCollector, {
        collectorId: adminDevice.collectorId,
      }),
    ).rejects.toThrow();
    await expect(
      member.mutation(api.account.renameCollector, {
        collectorId: adminDevice.collectorId,
        name: "stolen",
      }),
    ).rejects.toThrow();
    await expect(
      member.query(api.finance.summary, { month: "2026-09" }),
    ).rejects.toThrow("FORBIDDEN");
  });
  test("offboarding closes ingest immediately before queued key cleanup", async () => {
    await owner("admin", "org_company");
    const member = t.withIdentity(identity("member", "org_company", "member"));
    await member.mutation(api.workspaces.bootstrap, {});
    const device = await member.action(api.account.createCollector, {
      name: "Laptop",
    });
    await t.run(async (ctx) => {
      const collector = (await ctx.db.get(device.collectorId))!;
      await assertCollectorMembership(ctx, collector);
      const membership = (
        await ctx.db.query("workspaceMemberships").collect()
      ).find(
        (m) =>
          m.userId === collector.ownerUserId &&
          m.workspaceId === collector.workspaceId,
      );
      await ctx.db.patch(membership!._id, { status: "deactivated" });
      await expect(assertCollectorMembership(ctx, collector)).rejects.toThrow(
        "INVALID_COLLECTOR",
      );
    });
  });
  test("teams retain membership history and refuse foreign members", async () => {
    const admin = await owner("admin", "org_company");
    const outsider = await owner("outsider");
    const team = await admin.mutation(api.workspaces.createTeam, {
      name: "Platform",
      description: "Core",
    });
    const other = (await outsider.query(api.workspaces.overview, {})).userId;
    await expect(
      admin.mutation(api.workspaces.setTeamMember, {
        teamId: team,
        memberUserId: other,
        manager: false,
        remove: false,
      }),
    ).rejects.toThrow("MEMBER_NOT_FOUND");
    const me = (await admin.query(api.workspaces.overview, {})).userId;
    await admin.mutation(api.workspaces.setTeamMember, {
      teamId: team,
      memberUserId: me,
      manager: false,
      remove: true,
    });
    expect(
      (
        await admin.query(api.workspaces.teamMembers, {
          teamId: team,
          paginationOpts: page,
        })
      ).page,
    ).toEqual([]);
    expect(
      await t.run((ctx) => ctx.db.query("teamMembers").first()),
    ).toHaveProperty("leftAt");
  });
  test("team managers can page only unassigned active workspace candidates", async () => {
    const admin = await owner("team-admin", "org_team_candidates");
    const manager = t.withIdentity(identity("team-manager", "org_team_candidates", "manager"));
    const candidate = t.withIdentity(identity("team-candidate", "org_team_candidates", "member"));
    await manager.mutation(api.workspaces.bootstrap, {});
    await candidate.mutation(api.workspaces.bootstrap, {});
    const teamId = await admin.mutation(api.workspaces.createTeam, {
      name: "Platform",
      description: "",
    });
    const managerId = (await manager.query(api.workspaces.overview, {})).userId;
    const candidateId = (await candidate.query(api.workspaces.overview, {})).userId;
    await admin.mutation(api.workspaces.setTeamMember, {
      teamId,
      memberUserId: managerId,
      manager: true,
      remove: false,
    });
    const assignedTeam = await admin.mutation(api.workspaces.createTeam, {
      name: "Assigned",
      description: "",
    });
    const unrelatedTeam = await admin.mutation(api.workspaces.createTeam, {
      name: "Unrelated",
      description: "",
    });
    await admin.mutation(api.workspaces.setTeamMember, {
      teamId: assignedTeam,
      memberUserId: candidateId,
      manager: false,
      remove: false,
    });

    const result = await manager.query(api.workspaces.teamCandidates, {
      teamId,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(result.page).toEqual([
      expect.objectContaining({ userId: candidateId, email: "team-candidate@example.com" }),
    ]);
    await expect(manager.query(api.workspaces.teamCandidates, {
      teamId: unrelatedTeam,
      paginationOpts: { numItems: 10, cursor: null },
    })).rejects.toThrow("FORBIDDEN");
    expect((await admin.query(api.workspaces.teamCandidates, {
      teamId: unrelatedTeam,
      paginationOpts: { numItems: 10, cursor: null },
    })).page.length).toBeGreaterThan(0);
    await expect(manager.query(api.workspaces.members, { paginationOpts: page })).rejects.toThrow("FORBIDDEN");
  });
  test("enterprise feature checks cannot be bypassed by client plan labels", async () => {
    const session = await owner();
    await expect(session.query(api.connections.list, {})).rejects.toThrow(
      "ENTERPRISE_REQUIRED",
    );
    expect(
      (await session.query(api.workspaces.overview, {})).policy.enterprise,
    ).toBe(false);
    await expect(
      session.mutation(api.workspaces.configureWorkspace, {
        name: "Personal",
        retentionDays: 365,
      }),
    ).rejects.toThrow("INVALID_RETENTION");
  });
  test("savings require measurement evidence before verification", async () => {
    const session = await owner();
    const proposal = {
      title: "Cache tuning",
      description: "Measure cache behavior",
      evidence: "trace-123",
      currency: "USD",
      potentialMicros: 5_000_000,
      state: "proposed" as const,
    };
    const id = await session.mutation(api.savings.save, proposal);
    await expect(
      session.mutation(api.savings.save, {
        ...proposal,
        id,
        state: "verified",
      }),
    ).rejects.toThrow("MEASUREMENT_AND_BASELINE_REQUIRED");
    await session.mutation(api.savings.save, {
      ...proposal,
      id,
      state: "measuring",
    });
    await session.mutation(api.savings.save, {
      ...proposal,
      id,
      state: "verified",
      baseline: "invoice-before",
      resultEvidence: "invoice-after",
      observedMicros: 1_000_000,
    });
    expect(
      (await session.query(api.savings.list, { paginationOpts: page })).page[0],
    ).toMatchObject({
      potentialMicros: 5_000_000,
      observedMicros: 1_000_000,
      state: "verified",
    });
  });
  test("full export paginates past 500 rows", async () => {
    const session = await owner();
    for (let i = 0; i < 11; i++)
      await session.mutation(api.finance.record, {
        entries: Array.from({ length: 50 }, (_, j) =>
          entry(`line-${i}-${j}`, 1),
        ),
      });
    let cursor: string | null = null;
    let count = 0;
    let done = false;
    while (!done) {
      const result: FunctionReturnType<typeof api.personal.exportPage> =
        await session.query(api.personal.exportPage, {
          dataset: "ledger" as const,
          paginationOpts: { numItems: 100, cursor },
        });
      count += result.page.length;
      cursor = result.continueCursor;
      done = result.isDone;
    }
    expect(count).toBe(550);
  });
  test("paged detail exports include retained events without internal tenancy fields", async () => {
    const session = await owner("detail-export");
    await t.run(async (ctx) => {
      const user = (await ctx.db.query("users").collect()).find((row) => row.email === "detail-export@example.com");
      if (!user) throw new Error("user missing");
      const workspace = (await ctx.db.query("workspaces").collect()).find((row) => row.ownerId === user._id);
      if (!workspace) throw new Error("workspace missing");
      const profile = (await ctx.db.query("profiles").collect()).find((row) => row.workspaceId === workspace._id);
      if (!profile) throw new Error("profile missing");
      const now = Date.now();
      await ctx.db.insert("telemetryEvents", {
        workspaceId: workspace._id,
        profileId: profile._id,
        eventKey: "private-event-key",
        eventHash: "private-event-hash",
        eventType: "model_request",
        source: "test",
        provider: "openai",
        model: "private-model",
        inputTokens: 12,
        outputTokens: 3,
        cacheReadTokens: 0,
        reasoningTokens: 0,
        totalTokens: 15,
        costMicros: 24,
        status: "ok",
        task: "private task details",
        occurredAt: now,
        receivedAt: now,
        schemaVersion: 1,
        completeness: "reported",
      });
      await ctx.db.insert("agentLiveStats", {
        workspaceId: workspace._id,
        profileId: profile._id,
        externalId: "agent-private",
        name: "Private agent",
        model: "private-model",
        state: "running",
        tokensPerSecond: 2,
        totalTokens: 15,
        toolCalls: 1,
        errorCount: 0,
        sessionStartedAt: now,
        updatedAt: now,
        expiresAt: now + 60_000,
      });
      await ctx.db.insert("outcomes", {
        workspaceId: workspace._id,
        profileId: profile._id,
        eventKey: "private-outcome-key",
        logicalRequestId: "private-request-id",
        outcome: "accepted",
        occurredAt: now,
        createdAt: now,
      });
    });

    const telemetry = await session.query(api.personal.exportPage, { dataset: "telemetry", paginationOpts: page });
    const agents = await session.query(api.personal.exportPage, { dataset: "agents", paginationOpts: page });
    const outcomes = await session.query(api.personal.exportPage, { dataset: "outcomes", paginationOpts: page });
    expect(telemetry.page[0]).toMatchObject({ eventType: "model_request", task: "private task details", totalTokens: 15 });
    expect(telemetry.page[0]).not.toHaveProperty("workspaceId");
    expect(telemetry.page[0]).not.toHaveProperty("eventHash");
    expect(agents.page[0]).toMatchObject({ externalId: "agent-private", name: "Private agent" });
    expect(agents.page[0]).not.toHaveProperty("profileId");
    expect(outcomes.page[0]).toMatchObject({ outcome: "accepted", logicalRequestId: "private-request-id" });
    expect(outcomes.page[0]).not.toHaveProperty("workspaceId");
  });
});

describe("provider precision and export safety", () => {
  test("converts decimal cents without losing fee precision", () => {
    expect(centsToMicros("123.78912")).toBe(1_237_891);
    expect(centsToMicros("21.36232")).toBe(213_623);
    expect(centsToMicros("0.00005")).toBe(1);
    expect(centsToMicros(0)).toBe(0);
    expect(() => centsToMicros(undefined)).toThrow();
    expect(() => centsToMicros("NaN")).toThrow();
    expect(() => centsToMicros("-1")).toThrow();
  });
  test("neutralizes spreadsheet formulas", () => {
    expect(safeCsvCell("=cmd()")).toContain("'=cmd()");
    expect(safeCsvCell('a"b')).toBe('"a""b"');
  });
});
