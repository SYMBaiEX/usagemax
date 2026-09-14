import { createHash } from "node:crypto";
import { beforeEach, describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const token = "umx_test_0123456789abcdef0123456789abcdef";
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
    accountingMode: "usage" as const,
    ...overrides,
  };
}

describe("telemetry ingestion", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(async () => {
    t = convexTest(schema, modules);
    await t.mutation(internal.imports.begin, {
      handle: "tester",
      displayName: "Tester",
      sourceUrl: "https://example.com",
      collectorKeyHash: keyHash,
      collectorKeyPrefix: token.slice(0, 10),
      now: Date.now(),
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
    const live = await t.query(api.public.live, { handle: "tester", now: receivedAt, agentLimit: 10, eventLimit: 10 });
    expect(live.agents).toHaveLength(1);
    expect(live.agents[0].online).toBe(true);
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

  test("keeps observability events live without changing accounting totals", async () => {
    const receivedAt = Date.now();
    await t.mutation(internal.telemetry.commitBatch, {
      keyHash,
      batchId: "batch-observability",
      payloadHash: "payload-observability",
      receivedAt,
      events: [event({
        eventKey: "event-observability",
        occurredAt: receivedAt,
        accountingMode: "observability",
        costBasis: "unknown",
        costMicros: 0,
      })],
    });

    const profile = await t.query(api.public.profile, { handle: "tester" });
    expect(profile?.stats?.totalTokens ?? 0).toBe(0);
    expect(profile?.stats?.sessions ?? 0).toBe(0);

    const live = await t.query(api.public.live, {
      handle: "tester",
      now: receivedAt,
      agentLimit: 10,
      eventLimit: 10,
    });
    expect(live.agents).toHaveLength(1);
    expect(live.agents[0].online).toBe(true);
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
      inputTokens: 100,
      outputTokens: 20,
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
