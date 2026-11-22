import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import { DAY_MS } from "./lib";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const now = Date.parse("2026-11-21T12:00:00Z");
const day = "2026-11-21";
const path = "/v1/gateway/receipts";
const receipt = {
  schemaVersion: 1,
  requestId: "test-request.01",
  revision: 1,
  model: "openai/gpt-fixture",
  provider: "fixture",
  status: "ok",
  startedAt: now - 2_000,
  firstTokenAt: now - 1_000,
  settledAt: now,
  stream: true,
  traceId: "trace-fixture",
  currency: "USD",
  customerChargeNanos: 1000,
  providerCostNanos: null,
  providerCostBasis: "unknown",
  usage: { inputTokens: 4, outputTokens: 3, reasoningTokens: 0, reportedTotalTokens: 7 },
};

describe("private gateway receipts", () => {
  let t: TestConvex<typeof schema>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    t = convexTest(schema, modules);
    rateLimiterTest.register(t);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function tenant(label: string) {
    const subject = `user_${label}`;
    const issuer = "https://api.workos.com/";
    const session = t.withIdentity({ subject, issuer, tokenIdentifier: `${issuer}|${subject}` });
    await session.mutation(api.account.ensureProfile, { handle: `gateway-${label}` });
    const { workspaceId, projectId, userId } = await t.run(async (ctx) => {
      const profile = await ctx.db.query("profiles")
        .withIndex("by_handle", (q) => q.eq("handle", `gateway-${label}`)).unique();
      if (!profile?.ownerId) throw new Error("Missing fixture profile");
      const projectId = await ctx.db.insert("projects", {
        workspaceId: profile.workspaceId, name: "Gateway fixture", key: "gateway", costCenter: "", createdAt: now,
      });
      return { workspaceId: profile.workspaceId, projectId, userId: profile.ownerId };
    });
    const ingest = await session.action(api.gatewayCredentials.issue, { projectId, name: "Fixture writer", scope: "ingest" });
    const report = await session.action(api.gatewayCredentials.issue, { projectId, name: "Fixture reader", scope: "report" });
    return { session, workspaceId, userId, projectId, ingest, report };
  }

  function write(token: string, receipts: unknown[]) {
    return t.fetch(path, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ receipts }),
    });
  }

  function read(token: string, suffix: string) {
    return t.fetch(path + suffix, { headers: { authorization: `Bearer ${token}` } });
  }

  test("returns independent results for replay, conflict, late revisions, and stale delivery", async () => {
    const one = await tenant("one");
    expect(one.ingest.token).toMatch(/^umxg_[a-f0-9]{64}$/);
    const first = await write(one.ingest.token, [receipt]);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ results: [{ requestId: receipt.requestId, revision: 1, status: "accepted" }] });
    const corrected = { ...receipt, revision: 3, customerChargeNanos: 42, providerCostNanos: 0, providerCostBasis: "provider_reported" };
    vi.setSystemTime(now + DAY_MS / 2);
    const batch = await write(one.ingest.token, [
      { ...receipt, usage: { reportedTotalTokens: 7, reasoningTokens: 0, outputTokens: 3, inputTokens: 4 } },
      { ...receipt, stream: false },
      { ...corrected, settledAt: now + DAY_MS / 2 },
      corrected,
      { ...receipt, revision: 2 },
    ]);
    expect(batch.status).toBe(200);
    expect((await batch.json()).results.map((result: { status: string }) => result.status))
      .toEqual(["replay", "conflict", "conflict", "accepted", "stale"]);
    expect(await (await read(one.report.token, `?from=${day}&through=${day}`)).json())
      .toEqual({ receipts: [corrected], truncated: false });
    expect(await (await read(one.report.token, "?from=2026-11-22&through=2026-11-22")).json())
      .toEqual({ receipts: [], truncated: false });
    expect(await (await read(one.report.token, "/" + receipt.requestId)).json()).toEqual({ receipt: corrected });
    expect(await one.session.query(api.gatewayReceipts.get, { projectId: one.projectId, requestId: receipt.requestId })).toEqual(corrected);
    expect(await one.session.query(api.gatewayReceipts.list, { projectId: one.projectId, from: day, through: day }))
      .toEqual({ receipts: [corrected], truncated: false });

    const publicProfile = await t.query(api.public.profile, { handle: "gateway-one" });
    expect(publicProfile).toBeNull();
    const wireStatus = await t.fetch("/v1/gateway/status", { headers: { authorization: `Bearer ${one.ingest.token}` } });
    expect(await wireStatus.json()).toEqual({ ok: true, scope: "ingest", lastSuccessAt: now + DAY_MS / 2 });
  });

  test("isolates tenant projects, scopes, credentials, and exposes audited lifecycle operations", async () => {
    const one = await tenant("one");
    const two = await tenant("two");
    expect((await write(one.ingest.token, [receipt])).status).toBe(200);
    expect((await read(two.report.token, "/" + receipt.requestId)).status).toBe(404);
    expect((await read(one.ingest.token, "/" + receipt.requestId)).status).toBe(403);
    expect((await write(one.report.token, [receipt])).status).toBe(403);
    expect((await read("umxg_" + "0".repeat(64), "/" + receipt.requestId)).status).toBe(401);
    await expect(two.session.query(api.gatewayReceipts.get, { projectId: one.projectId, requestId: receipt.requestId }))
      .rejects.toThrow("GATEWAY_PROJECT_NOT_FOUND");
    await expect(two.session.action(api.gatewayCredentials.issue, { projectId: one.projectId, name: "wrong", scope: "report" }))
      .rejects.toThrow("GATEWAY_PROJECT_NOT_FOUND");
    await expect(two.session.mutation(api.gatewayCredentials.revoke, { credentialId: one.ingest.credentialId }))
      .rejects.toThrow("GATEWAY_CREDENTIAL_NOT_FOUND");
    await expect(t.query(api.gatewayCredentials.list, { projectId: one.projectId })).rejects.toThrow("AUTH_REQUIRED");

    const rotated = await one.session.action(api.gatewayCredentials.rotate, { credentialId: one.ingest.credentialId });
    expect(rotated.credentialId).toBe(one.ingest.credentialId);
    expect(rotated.token).not.toBe(one.ingest.token);
    expect((await write(one.ingest.token, [receipt])).status).toBe(401);
    expect((await write(rotated.token, [receipt])).status).toBe(200);
    expect(await one.session.mutation(api.gatewayCredentials.revoke, { credentialId: rotated.credentialId })).toEqual({ ok: true });
    expect((await write(rotated.token, [receipt])).status).toBe(401);
    const list = await one.session.query(api.gatewayCredentials.list, { projectId: one.projectId });
    expect(list.credentials).toHaveLength(2);
    expect(JSON.stringify(list)).not.toContain(rotated.token);
    expect(JSON.stringify(list)).not.toContain("keyHash");
    const audit = await t.run((ctx) => ctx.db.query("auditEvents")
      .withIndex("by_workspaceId_and_createdAt", (q) => q.eq("workspaceId", one.workspaceId)).take(10));
    expect(audit.map((row) => row.action)).toEqual(expect.arrayContaining([
      "gateway.credential_issued", "gateway.credential_rotated", "gateway.credential_revoked",
    ]));
  });

  test("honors workspace permissions independently for credential management and finance reads", async () => {
    const one = await tenant("one");
    const two = await tenant("two");
    const organization = "org_fixture";
    const issuer = "https://api.workos.com/";
    await t.run(async (ctx) => {
      await ctx.db.patch("workspaces", one.workspaceId, { workosOrganizationId: organization });
      await ctx.db.insert("workspaceMemberships", {
        workspaceId: one.workspaceId, userId: two.userId, role: "viewer", status: "active", source: "workos",
        createdAt: now, updatedAt: now, lastSyncedAt: now,
      });
    });
    const session = (permissions: string[]) => t.withIdentity({
      subject: "user_two", issuer, tokenIdentifier: `${issuer}|user_two`, org_id: organization, permissions,
    });
    const manager = session(["collectors:manage"]);
    const finance = session(["finance:read"]);
    const paginationOpts = { cursor: null, numItems: 1 };
    expect((await manager.query(api.gatewayCredentials.projects, { paginationOpts })).page)
      .toMatchObject([{ _id: one.projectId, name: "Gateway fixture", key: "gateway" }]);
    expect((await finance.query(api.gatewayCredentials.projects, { paginationOpts })).isDone).toBe(true);
    expect(await manager.query(api.gatewayCredentials.project, { projectId: one.projectId })).toMatchObject({ _id: one.projectId });
    expect(await manager.query(api.gatewayCredentials.project, { projectId: two.projectId })).toBeNull();
    expect(await manager.query(api.gatewayCredentials.project, { projectId: "invalid" })).toBeNull();
    await expect(session([]).query(api.gatewayCredentials.projects, { paginationOpts })).rejects.toThrow("FORBIDDEN");
    await expect(manager.action(api.gatewayCredentials.issue, { projectId: one.projectId, name: "Unauthorized reports", scope: "report" }))
      .rejects.toThrow("FORBIDDEN");
    await expect(manager.query(api.gatewayReceipts.list, { projectId: one.projectId, from: day, through: day })).rejects.toThrow("FORBIDDEN");
    await expect(finance.query(api.gatewayCredentials.list, { projectId: one.projectId })).rejects.toThrow("FORBIDDEN");
    const managerKey = await manager.action(api.gatewayCredentials.issue, { projectId: one.projectId, name: "Authorized writer", scope: "ingest" });
    expect((await write(managerKey.token, [receipt])).status).toBe(200);
    expect((await manager.query(api.gatewayCredentials.list, { projectId: one.projectId })).credentials.every((key) => key.scope === "ingest")).toBe(true);
    expect(await finance.query(api.gatewayReceipts.get, { projectId: one.projectId, requestId: receipt.requestId })).toEqual(receipt);
  });

  test("rejects extra content, noninteger values, unsafe identifiers, and malformed batches before applying them", async () => {
    const one = await tenant("one");
    for (const malformed of [
      { ...receipt, prompt: "private" },
      { ...receipt, usage: { ...receipt.usage, unclassifiedTokens: -1 } },
      { ...receipt, requestId: "fixture/request" },
      { ...receipt, customerChargeNanos: 0.5 },
      { ...receipt, startedAt: receipt.settledAt + 1 },
      { ...receipt, workspaceId: one.workspaceId },
    ]) {
      const rejected = await write(one.ingest.token, [receipt, malformed]);
      expect(rejected.status).toBe(400);
      expect(await rejected.json()).toEqual({ error: "invalid_gateway_batch" });
    }
    expect((await write(one.ingest.token, Array.from({ length: 51 }, () => receipt))).status).toBe(400);
    const oversized = await t.fetch(path, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${one.ingest.token}` }, body: " ".repeat(65_537) });
    expect(oversized.status).toBe(413);
    expect((await read(one.report.token, "?from=2026-10-21&through=2026-11-21")).status).toBe(400);
    expect((await read(one.report.token, `?from=${day}&through=${day}&limit=101`)).status).toBe(400);
    expect((await read(one.report.token, `?from=${day}&through=${day}&limit=1&limit=2`)).status).toBe(400);
    expect(await (await read(one.report.token, `?from=${day}&through=${day}`)).json()).toEqual({ receipts: [], truncated: false });
  });

  test("enforces workspace retention, blocks inactive credentials, and erases gateway data with the workspace", async () => {
    const one = await tenant("one");
    expect((await write(one.ingest.token, [receipt])).status).toBe(200);
    await t.run(async (ctx) => {
      await ctx.db.patch("workspaces", one.workspaceId, { retentionDays: 1 });
    });
    vi.setSystemTime(now + 2 * DAY_MS);
    const stale = await write(one.ingest.token, [{ ...receipt, revision: 2, settledAt: now + 2 * DAY_MS }]);
    expect((await stale.json()).results[0].status).toBe("stale");
    expect((await read(one.report.token, "/" + receipt.requestId)).status).toBe(404);
    expect(await (await read(one.report.token, `?from=${day}&through=${day}`)).json()).toEqual({ receipts: [], truncated: false });
    expect(await one.session.query(api.gatewayReceipts.get, { projectId: one.projectId, requestId: receipt.requestId })).toBeNull();
    expect(await t.mutation(internal.retention.trim, { workspaceId: one.workspaceId })).toMatchObject({ gatewayReceiptsRemoved: 1 });
    expect((await write(one.ingest.token, [{ ...receipt, requestId: "fresh", settledAt: now + 2 * DAY_MS }])).status).toBe(200);
    await t.run(async (ctx) => {
      await ctx.db.patch("projects", one.projectId, { archivedAt: Date.now() });
    });
    expect((await read(one.report.token, "/fresh")).status).toBe(401);
    await t.run(async (ctx) => {
      await ctx.db.patch("projects", one.projectId, { archivedAt: undefined });
    });
    expect((await read(one.report.token, "/fresh")).status).toBe(200);

    const requestId = await t.run((ctx) => ctx.db.insert("accountDeletionRequests", {
      workspaceId: one.workspaceId, userId: one.userId, requestedAt: Date.now(), scheduledFor: Date.now(), stage: "productData",
    }));
    expect((await read(one.report.token, "/fresh")).status).toBe(401);
    expect((await write(one.ingest.token, [receipt])).status).toBe(401);
    await t.mutation(internal.account.processAccountDeletion, { requestId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const remaining = await t.run(async (ctx) => ({
      credentials: await ctx.db.query("gatewayCredentials").withIndex("by_workspaceId", (q) => q.eq("workspaceId", one.workspaceId)).take(1),
      receipts: await ctx.db.query("gatewayReceipts").withIndex("by_workspaceId_and_historyAt", (q) => q.eq("workspaceId", one.workspaceId)).take(1),
    }));
    expect(remaining).toEqual({ credentials: [], receipts: [] });
  });
});
