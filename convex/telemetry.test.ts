import { createHash } from "node:crypto";
import { beforeEach, describe, expect, test } from "vitest";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const token = `umx_${"d".repeat(64)}`;
const keyHash = createHash("sha256").update(token).digest("hex");

function event(overrides: Record<string, unknown> = {}) {
  return {
    eventKey: "event-1",
    eventHash: "hash-1",
    sessionId: "session-1",
    agentExternalId: "agent-1",
    agentName: "Codex",
    eventType: "model_request" as const,
    source: "test",
    provider: "openai",
    model: "gpt-test",
    inputTokens: 100,
    outputTokens: 20,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: 120,
    costMicros: 500,
    latencyMs: 1000,
    status: "ok" as const,
    state: "running",
    occurredAt: Date.now(),
    schemaVersion: 1,
    completeness: "reported" as const,
    costBasis: "reported" as const,
    ...overrides,
  };
}

async function seedCollector(t: ReturnType<typeof convexTest>, now: number) {
  await t.run(async (ctx) => {
    const workspaceId = await ctx.db.insert("workspaces", {
      slug: "tester",
      name: "Tester workspace",
      plan: "free",
      isPublic: true,
      retentionDays: 30,
      createdAt: now,
    });
    const profileId = await ctx.db.insert("profiles", {
      workspaceId,
      handle: "tester",
      displayName: "Tester",
      bio: "",
      isPublic: true,
      isVerified: false,
      verification: "collector",
      createdAt: now,
    });
    await ctx.db.insert("profileStats", {
      workspaceId,
      profileId,
      totalTokens: 0,
      totalCostMicros: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
      sessions: 0,
      activeDays: 0,
      currentStreakDays: 0,
      longestStreakDays: 0,
      deviceCount: 1,
      topModel: "unknown",
      updatedAt: now,
    });
    await ctx.db.insert("collectors", {
      workspaceId,
      profileId,
      name: "Test collector",
      keyHash,
      keyPrefix: token.slice(0, 10),
      scopes: ["telemetry:write", "outcomes:write"],
      createdAt: now,
    });
  });
}

describe("telemetry ingestion", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(async () => {
    t = convexTest(schema, modules);
    rateLimiterTest.register(t);
    await seedCollector(t, Date.now());
  });

  test("diagnoses a collector without returning its secret", async () => {
    const response = await t.fetch("/v1/devices/status", {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
        "x-usagemax-device-id": "01234567-89ab-4cde-8fab-0123456789ab",
      },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, status: "active", credentialType: "collector", writeOnly: true, activation: "not_required", scopeStatus: "valid", ingestAuthorized: true, deviceBinding: "unbound" });
    expect(JSON.stringify(body)).not.toContain(token);
    expect(body).not.toHaveProperty("keyHash");

    const unknown = await t.fetch("/v1/devices/status", {
      method: "GET",
      headers: { authorization: `Bearer umx_${"f".repeat(64)}` },
    });
    expect(unknown.status).toBe(401);
  });

  test("diagnoses a recognized collector that cannot ingest because its scope is missing", async () => {
    await t.run(async (ctx) => {
      const collector = await ctx.db.query("collectors").unique();
      await ctx.db.patch(collector!._id, { scopes: ["outcomes:write"] });
    });
    const response = await t.fetch("/v1/devices/status", {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: false, status: "scope_missing", scopeStatus: "missing_telemetry_write", ingestAuthorized: false });
  });

  test("requires the installation header at the backend write boundary", async () => {
    const response = await t.fetch("/v1/telemetry/llm", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "idempotency-key": "missing-installation",
      },
      body: JSON.stringify({ events: [{ eventKey: "missing-installation", model: "relay-activity", occurredAt: Date.now(), totalTokens: 0, costMicros: 0 }] }),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_device_id" });
  });

  test("advanced account keys authenticate through native telemetry and bind on first write", async () => {
    const session = t.withIdentity({
      subject: "user_01ADVANCEDCOLLECTOR",
      issuer: "https://api.workos.com/",
      tokenIdentifier: "https://api.workos.com/|user_01ADVANCEDCOLLECTOR",
      name: "Advanced Collector",
      email: "advanced@example.com",
    });
    await session.mutation(api.account.ensureProfile, { handle: "advanced-collector" });
    const created = await session.action(api.account.createCollector, { name: "HUD relay" });
    const installationId = "01234567-89ab-4cde-8fab-0123456789ab";
    const occurredAt = Date.now();
    const response = await t.fetch("/v1/telemetry/llm", {
      method: "POST",
      headers: {
        authorization: `Bearer ${created.token}`,
        "content-type": "application/json",
        "idempotency-key": "advanced-hud-probe",
        "x-usagemax-device-id": installationId,
      },
      body: JSON.stringify({
        events: [{
          eventKey: "advanced-hud-probe",
          eventType: "agent_state",
          accountingMode: "observability",
          source: "local-hud-relay",
          provider: "usagemax",
          model: "relay-activity",
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          reasoningTokens: 0,
          totalTokens: 0,
          costMicros: 0,
          status: "ok",
          state: "diagnostic",
          occurredAt,
          schemaVersion: 1,
          completeness: "unknown",
        }],
      }),
    });
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ ok: true, accepted: 1, duplicates: 0, conflicts: 0, replay: false });

    const status = await t.fetch("/v1/devices/status", {
      method: "GET",
      headers: {
        authorization: `Bearer ${created.token}`,
        "x-usagemax-device-id": installationId,
      },
    });
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({
      ok: true,
      status: "active",
      credentialType: "collector",
      scopeStatus: "valid",
      ingestAuthorized: true,
      deviceBinding: "matched",
      profileHandle: "advanced-collector",
      deviceName: "HUD relay",
    });
  });

  test("commits once and updates realtime projections", async () => {
    const receivedAt = Date.now();
    const first = await t.mutation(internal.telemetry.commitBatch, {
      keyHash,
      batchId: "batch-1",
      payloadHash: "payload-1",
      receivedAt,
      events: [event({ occurredAt: receivedAt })],
    });
    expect(first).toEqual({ accepted: 1, duplicates: 0, conflicts: 0, replay: false });

    const replay = await t.mutation(internal.telemetry.commitBatch, {
      keyHash,
      batchId: "batch-1",
      payloadHash: "payload-1",
      receivedAt,
      events: [event({ occurredAt: receivedAt })],
    });
    expect(replay.replay).toBe(true);

    const profile = await t.query(api.public.profile, { handle: "tester" });
    expect(profile?.stats?.totalTokens).toBe(120);
    expect(profile?.stats?.sessions).toBe(1);
    expect(profile?.stats).toMatchObject({
      activeDays: 1,
      currentStreakDays: 1,
      longestStreakDays: 1,
      deviceCount: 1,
      peakDayCostMicros: 500,
      avgCostPerActiveDayMicros: 500,
    });
    const breakdowns = await t.query(api.public.breakdowns, { handle: "tester", days: 30 });
    expect(breakdowns.sources).toEqual([expect.objectContaining({ key: "test", totalTokens: 120 })]);
    expect(breakdowns.devices).toEqual([expect.objectContaining({ key: expect.stringMatching(/^Device [a-f0-9]{8}$/), totalTokens: 120 })]);
    const live = await t.query(api.public.live, { handle: "tester", agentLimit: 10, eventLimit: 10 });
    expect(live.agents).toHaveLength(1);
    expect(live.agents[0].expiresAt).toBeGreaterThan(receivedAt);
    expect(live.events).toHaveLength(1);
  });

  test("deduplicates events across different batches", async () => {
    const receivedAt = Date.now();
    await t.mutation(internal.telemetry.commitBatch, {
      keyHash,
      batchId: "batch-a",
      payloadHash: "payload-a",
      receivedAt,
      events: [event({ occurredAt: receivedAt })],
    });
    const duplicate = await t.mutation(internal.telemetry.commitBatch, {
      keyHash,
      batchId: "batch-b",
      payloadHash: "payload-b",
      receivedAt: receivedAt + 1,
      events: [event({ occurredAt: receivedAt })],
    });
    expect(duplicate).toMatchObject({ accepted: 0, duplicates: 1 });
    const profile = await t.query(api.public.profile, { handle: "tester" });
    expect(profile?.stats?.totalTokens).toBe(120);
  });

  test("preserves tokens that a source cannot allocate to standard buckets", async () => {
    const receivedAt = Date.now();
    await t.mutation(internal.telemetry.commitBatch, {
      keyHash,
      batchId: "batch-unclassified",
      payloadHash: "payload-unclassified",
      receivedAt,
      events: [event({ totalTokens: 150, occurredAt: receivedAt })],
    });
    const state = await t.run(async (ctx) => ({
      stats: await ctx.db.query("profileStats").filter((q) => q.eq(q.field("totalTokens"), 150)).unique(),
      daily: await ctx.db.query("dailyUsage").filter((q) => q.eq(q.field("model"), "gpt-test")).unique(),
      model: await ctx.db.query("modelTotals").filter((q) => q.eq(q.field("model"), "gpt-test")).unique(),
    }));
    expect(state.stats?.unclassifiedTokens).toBe(30);
    expect(state.daily?.unclassifiedTokens).toBe(30);
    expect(state.model?.unclassifiedTokens).toBe(30);
  });

  test("binds a legacy collector to one stable installation without adding a device", async () => {
    const receivedAt = Date.now();
    await t.mutation(internal.telemetry.commitBatch, {
      keyHash,
      batchId: "batch-before-identity",
      payloadHash: "payload-before-identity",
      receivedAt,
      events: [event({ eventKey: "event-before-identity", occurredAt: receivedAt })],
    });
    await t.mutation(internal.telemetry.commitBatch, {
      keyHash,
      batchId: "batch-with-identity",
      payloadHash: "payload-with-identity",
      installationIdHash: "stable-installation-hash",
      receivedAt: receivedAt + 1,
      events: [event({ eventKey: "event-with-identity", eventHash: "hash-2", occurredAt: receivedAt + 1 })],
    });

    const state = await t.run(async (ctx) => ({
      collector: await ctx.db.query("collectors").filter((q) => q.eq(q.field("keyHash"), keyHash)).unique(),
      devices: await ctx.db.query("profileDevices").collect(),
    }));
    expect(state.collector?.installationIdHash).toBe("stable-installation-hash");
    expect(state.devices).toHaveLength(1);
    expect(state.devices[0].deviceHash).toBe("stable-installation-hash");
    await expect(t.mutation(internal.telemetry.commitBatch, {
      keyHash,
      batchId: "batch-wrong-identity",
      payloadHash: "payload-wrong-identity",
      installationIdHash: "different-installation-hash",
      receivedAt: receivedAt + 2,
      events: [event({ eventKey: "event-wrong-identity", eventHash: "hash-3", occurredAt: receivedAt + 2 })],
    })).rejects.toThrow("DEVICE_ID_MISMATCH");
  });

  test("repairs only a proven semantically identical duplicate collector", async () => {
    const now = Date.now();
    const duplicateToken = "umx_duplicate_0123456789abcdef0123456789";
    const duplicateKeyHash = createHash("sha256").update(duplicateToken).digest("hex");
    const ids = await t.run(async (ctx) => {
      const canonical = await ctx.db.query("collectors").filter((q) => q.eq(q.field("keyHash"), keyHash)).unique();
      if (!canonical) throw new Error("missing canonical collector");
      const duplicateCollectorId = await ctx.db.insert("collectors", {
        workspaceId: canonical.workspaceId,
        profileId: canonical.profileId,
        name: "Duplicate collector",
        keyHash: duplicateKeyHash,
        keyPrefix: duplicateToken.slice(0, 10),
        scopes: ["telemetry:write", "outcomes:write"],
        createdAt: now,
      });
      return { canonicalCollectorId: canonical._id, duplicateCollectorId };
    });
    const canonicalRawId = "11111111-2222-4333-8444-555555555555";
    const duplicateRawId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const occurredAt = now;
    await t.mutation(internal.telemetry.commitBatch, {
      keyHash,
      batchId: `cli:${canonicalRawId}:canonical`,
      payloadHash: "canonical-payload",
      receivedAt: now + 10,
      events: [event({
        eventKey: `ccusage-v1:${canonicalRawId}:same-row`,
        eventHash: "canonical-hash",
        agentExternalId: `${canonicalRawId}:codex`,
        sessionId: undefined,
        occurredAt,
      })],
    });
    await t.mutation(internal.telemetry.commitBatch, {
      keyHash: duplicateKeyHash,
      batchId: `cli:${duplicateRawId}:duplicate`,
      payloadHash: "duplicate-payload",
      receivedAt: now + 20,
      events: [event({
        eventKey: `ccusage-v1:${duplicateRawId}:same-row`,
        eventHash: "duplicate-hash",
        agentExternalId: `${duplicateRawId}:codex`,
        sessionId: undefined,
        occurredAt,
      })],
    });

    await expect(t.mutation(internal.maintenance.repairDuplicateCollector, {
      ...ids,
      expectedEvents: 1,
      expectedTotalTokens: 121,
      now: now + 30,
    })).rejects.toThrow("DUPLICATE_REPAIR_TOTAL_MISMATCH");
    await expect(t.mutation(internal.maintenance.repairDuplicateCollector, {
      ...ids,
      expectedEvents: 1,
      expectedTotalTokens: 120,
      now: now + 30,
    })).resolves.toEqual({ removedEvents: 1, removedTokens: 120, deviceCount: 1 });

    const profile = await t.query(api.public.profile, { handle: "tester" });
    expect(profile?.stats?.totalTokens).toBe(120);
    expect(profile?.stats?.deviceCount).toBe(1);
    const stored = await t.run(async (ctx) => ({
      events: await ctx.db.query("telemetryEvents").collect(),
      duplicate: await ctx.db.get(ids.duplicateCollectorId),
    }));
    expect(stored.events).toHaveLength(1);
    expect(stored.duplicate?.lastFailureCode).toBe("duplicate_import_removed");
    expect(stored.duplicate?.revokedAt).toBe(now + 30);
  });

  test("keeps non-accounting agent events live without changing usage totals", async () => {
    const receivedAt = Date.now();
    await t.mutation(internal.telemetry.commitBatch, {
      keyHash,
      batchId: "batch-observability",
      payloadHash: "payload-observability",
      receivedAt,
      events: [event({
        eventKey: "event-observability",
        occurredAt: receivedAt,
        eventType: "agent_state",
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costBasis: "unknown",
        costMicros: 0,
      })],
    });

    const profile = await t.query(api.public.profile, { handle: "tester" });
    expect(profile?.stats?.totalTokens ?? 0).toBe(0);
    expect(profile?.stats?.sessions ?? 0).toBe(0);

    const live = await t.query(api.public.live, {
      handle: "tester",
      agentLimit: 10,
      eventLimit: 10,
    });
    expect(live.agents).toHaveLength(1);
    expect(live.agents[0].expiresAt).toBeGreaterThan(receivedAt);
    expect(live.events).toHaveLength(1);
  });

  test("rejects unknown collectors", async () => {
    await expect(t.mutation(internal.telemetry.commitBatch, {
      keyHash: "unknown",
      batchId: "batch-x",
      payloadHash: "payload-x",
      receivedAt: Date.now(),
      events: [event()],
    })).rejects.toThrow();
  });

  test("rejects future timestamps at the HTTP boundary", async () => {
    const response = await t.fetch("/v1/telemetry/llm", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "idempotency-key": "future-batch",
        "x-usagemax-device-id": "01234567-89ab-4cde-8fab-0123456789ab",
      },
      body: JSON.stringify({ events: [{
        eventKey: "future-event",
        model: "gpt-test",
        occurredAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      }] }),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_timestamp" });
  });

  test("normalizes current GenAI cache and reasoning attributes without double counting", async () => {
    const now = Date.now();
    const start = `${now - 1_000}000000`;
    const end = `${now}000000`;
    const attribute = (key: string, intValue: number) => ({ key, value: { intValue } });
    const response = await t.fetch("/v1/traces", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "idempotency-key": "otel-current-semconv",
        "x-usagemax-device-id": "01234567-89ab-4cde-8fab-0123456789ab",
      },
      body: JSON.stringify({
        resourceSpans: [{
          resource: { attributes: [{ key: "service.name", value: { stringValue: "Codex" } }] },
          scopeSpans: [{ spans: [{
            traceId: "0123456789abcdef0123456789abcdef",
            spanId: "0123456789abcdef",
            name: "chat gpt-test",
            startTimeUnixNano: start,
            endTimeUnixNano: end,
            attributes: [
              { key: "gen_ai.provider.name", value: { stringValue: "openai" } },
              { key: "gen_ai.response.model", value: { stringValue: "gpt-test" } },
              attribute("gen_ai.usage.input_tokens", 100),
              attribute("gen_ai.usage.output_tokens", 20),
              attribute("gen_ai.usage.cache_read.input_tokens", 40),
              attribute("gen_ai.usage.cache_creation.input_tokens", 10),
              attribute("gen_ai.usage.reasoning.output_tokens", 5),
              attribute("gen_ai.usage.cost_micros", 0),
            ],
          }] }],
        }],
      }),
    });
    expect(response.status).toBe(202);

    const profile = await t.query(api.public.profile, { handle: "tester" });
    expect(profile?.stats).toMatchObject({
      totalTokens: 120,
      inputTokens: 50,
      outputTokens: 15,
      cacheReadTokens: 40,
      cacheWriteTokens: 10,
      reasoningTokens: 5,
      totalCostMicros: 0,
      costBasis: "reported",
    });
  });

  test("preserves pricing and allocation provenance without exposing it as calculated truth", async () => {
    const receivedAt = Date.now();
    await t.mutation(internal.telemetry.commitBatch, {
      keyHash,
      batchId: "batch-pricing-context",
      payloadHash: "payload-pricing-context",
      receivedAt,
      events: [event({
        eventKey: "event-pricing-context",
        occurredAt: receivedAt,
        pricingSource: "provider-billing-export",
        pricingVersion: "2026-09-14",
        serviceTier: "priority",
        region: "us-east",
        currency: "USD",
        projectId: "agent-platform",
        costCenter: "engineering",
      })],
    });
    const stored = await t.run(async (ctx) => ctx.db
      .query("telemetryEvents")
      .filter((q) => q.eq(q.field("eventKey"), "event-pricing-context"))
      .unique());
    expect(stored).toMatchObject({
      pricingSource: "provider-billing-export",
      pricingVersion: "2026-09-14",
      serviceTier: "priority",
      region: "us-east",
      currency: "USD",
      projectId: "agent-platform",
      costCenter: "engineering",
    });
  });
});


describe("disjoint accounting repair", () => {
  test("requires exact receipt evidence for legacy events without a collector ID", async () => {
    const t = convexTest(schema, modules);
    rateLimiterTest.register(t);
    const now = Date.now();
    await seedCollector(t, now);
    await t.mutation(internal.telemetry.commitBatch, { keyHash, batchId: "cli:installation-1:batch", payloadHash: "repair", receivedAt: now,
      events: [event({ eventKey: "ccusage-v1:installation-1:row", schemaVersion: 1, state: "synced", pricingSource: "ccusage / LiteLLM",
        inputTokens: 100, outputTokens: 20, cacheReadTokens: 10, totalTokens: 120, occurredAt: now })] });
    await t.run(async ctx => {
      const raw = await ctx.db.query("telemetryEvents").unique();
      await ctx.db.patch(raw!._id, { bucketVersion: undefined, collectorId: undefined });
      for (const name of ["dailyUsage", "modelTotals", "profileStats"] as const) {
        const row = await ctx.db.query(name).unique();
        await ctx.db.patch(row!._id, { inputTokens: 100, outputTokens: 20, cacheReadTokens: 10, unclassifiedTokens: 0 });
      }
      const day = await ctx.db.query("profileDailyTotals").unique();
      await ctx.db.patch(day!._id, { outputTokens: 20, unclassifiedTokens: 0 });
      for (const row of await ctx.db.query("dailyDimensions").collect()) await ctx.db.patch(row._id, { outputTokens: 20, unclassifiedTokens: 0 });
      const receipt = await ctx.db.query("ingestReceipts").unique();
      await ctx.db.patch(receipt!._id, { batchId: "cli:unrelated-installation:batch" });
    });
    const before = await t.query(api.public.profile, { handle: "tester" });
    await expect(t.mutation(internal.maintenance.reconcileTokenBuckets, { handle: "tester", dryRun: false, expectedResidual: 10 }))
      .rejects.toThrow("REPAIR_COLLECTOR_UNPROVEN");
    expect((await t.query(api.public.profile, { handle: "tester" }))?.stats).toEqual(before?.stats);
    await t.run(async ctx => {
      const receipt = await ctx.db.query("ingestReceipts").unique();
      await ctx.db.patch(receipt!._id, { batchId: "cli:installation-1:batch" });
    });
    expect(await t.mutation(internal.maintenance.reconcileTokenBuckets, { handle: "tester", dryRun: true }))
      .toMatchObject({ residual: 10, correction: -10, remainingResidual: 0, changedEvents: 1, plannedRows: 6 });
    await t.mutation(internal.maintenance.reconcileTokenBuckets, { handle: "tester", dryRun: false, expectedResidual: 10 });
    const after = await t.query(api.public.profile, { handle: "tester" });
    expect(after?.stats).toMatchObject({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, unclassifiedTokens: 120, totalTokens: 120, totalCostMicros: 500 });
    const dimensions = await t.run(async ctx => ctx.db.query("dailyDimensions").collect());
    expect(dimensions).toHaveLength(2);
    for (const row of dimensions) expect(row).toMatchObject({ outputTokens: 0, unclassifiedTokens: 120, totalTokens: 120 });
  });

  test("previews and repairs proven old event overlaps atomically and idempotently", async () => {
    const t = convexTest(schema, modules);
    rateLimiterTest.register(t);
    const now = Date.now();
    await seedCollector(t, now);
    await t.mutation(internal.telemetry.commitBatch, { keyHash, batchId: "repair", payloadHash: "repair", receivedAt: now,
      events: [event({ schemaVersion: 2, cacheReadTokens: 40, cacheWriteTokens: 10, reasoningTokens: 5, occurredAt: now })] });
    // Recreate the old deployed projection, keeping original provider evidence.
    await t.run(async ctx => {
      const raw = await ctx.db.query("telemetryEvents").unique();
      await ctx.db.patch(raw!._id, { bucketVersion: undefined });
      for (const name of ["dailyUsage", "modelTotals", "profileStats"] as const) {
        const row = await ctx.db.query(name).unique();
        await ctx.db.patch(row!._id, { inputTokens: 100, outputTokens: 20 });
      }
      const day = await ctx.db.query("profileDailyTotals").unique();
      await ctx.db.patch(day!._id, { outputTokens: 20 });
      for (const row of await ctx.db.query("dailyDimensions").collect()) await ctx.db.patch(row._id, { outputTokens: 20 });
    });
    const before = await t.query(api.public.profile, { handle: "tester" });
    const audit = await t.mutation(internal.maintenance.reconcileTokenBuckets, { handle: "tester", dryRun: true });
    expect(audit).toMatchObject({ residual: 55, correction: -55, remainingResidual: 0, changedEvents: 1 });
    await expect(t.mutation(internal.maintenance.reconcileTokenBuckets, { handle: "tester", dryRun: false, expectedResidual: 54 })).rejects.toThrow("REPAIR_EVIDENCE_MISMATCH");
    expect((await t.query(api.public.profile, { handle: "tester" }))?.stats).toEqual(before?.stats);
    await t.mutation(internal.maintenance.reconcileTokenBuckets, { handle: "tester", dryRun: false, expectedResidual: 55 });
    const after = await t.query(api.public.profile, { handle: "tester" });
    expect(after?.stats).toMatchObject({ inputTokens: 50, outputTokens: 15, cacheReadTokens: 40, cacheWriteTokens: 10, reasoningTokens: 5, totalTokens: 120, totalCostMicros: 500 });
    expect((await t.mutation(internal.maintenance.reconcileTokenBuckets, { handle: "tester", dryRun: true })).changedEvents).toBe(0);
    await t.mutation(internal.maintenance.reconcileTokenBuckets, { handle: "tester", dryRun: false, expectedResidual: 0 });
    expect((await t.query(api.public.profile, { handle: "tester" }))?.stats).toEqual(after?.stats);
  });
});
