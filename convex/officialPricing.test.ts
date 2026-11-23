import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import { officialCatalogForDay, officialRateCard } from "./officialPricingLookup";
import { automaticSnapshotPrice } from "./snapshotPricing";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const observedAt = Date.parse("2026-11-22T04:11:00Z");
const tomorrow = Date.parse("2026-11-23T13:00:00Z");
const digest = "a".repeat(64);
const model = "gpt-example-1";
const original = { model, standard: { input: 2, output: 10, cacheRead: null } };
const usage = {
  source: "codex", provider: "openai", model, day: "2026-11-23",
  pricingVersion: "ccusage@20.0.51:live-with-bundled-fallback:direct-v1",
  costBasis: "estimated" as const, inputTokens: 100, outputTokens: 40,
  cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, unclassifiedTokens: 0, totalTokens: 140, costMicros: 100,
};

describe("official pricing observations", () => {
  test("publishes only from the next UTC day and preserves past versions", async () => {
    const t = convexTest(schema, modules);
    const originalObservation = { provider: "openai" as const, observedAt, revision: digest, models: [original] };
    expect(await t.mutation(internal.officialPricing.recordObservation, originalObservation)).toBe(true);
    const before = await t.run(async (ctx) => (await officialCatalogForDay(ctx, "openai", "2026-11-22", tomorrow)) === undefined);
    const active = await t.run((ctx) => officialCatalogForDay(ctx, "openai", "2026-11-23", tomorrow));
    expect(before).toBe(true);
    expect(active?.models).toEqual([original]);

    const later = { ...original, standard: { ...original.standard, input: 3 } };
    expect(await t.mutation(internal.officialPricing.recordObservation, {
      provider: "openai", observedAt: tomorrow, revision: "b".repeat(64), models: [later],
    })).toBe(true);
    const equal = await t.mutation(internal.officialPricing.recordObservation, {
      provider: "openai", observedAt: tomorrow + 1000, revision: "b".repeat(64), models: [later],
    });
    expect(equal).toBe(false);
    const nextDay = Date.parse("2026-11-24T13:00:00Z");
    const previous = await t.run((ctx) => officialCatalogForDay(ctx, "openai", "2026-11-23", nextDay));
    const current = await t.run((ctx) => officialCatalogForDay(ctx, "openai", "2026-11-24", nextDay));
    expect(previous?.models).toEqual([original]);
    expect(current?.models).toEqual([later]);
  });

  test("a failed refresh keeps the last success and later pauses new observed quotes", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.officialPricing.recordObservation, {
      provider: "openai", observedAt, revision: digest, models: [original],
    });
    await t.mutation(internal.officialPricing.recordFailure, {
      provider: "openai", observedAt: tomorrow, reason: "invalid_source",
    });
    expect(await t.query(internal.officialPricing.status, {})).toMatchObject([{
      provider: "openai", lastError: "invalid_source", lastSuccessAt: observedAt, effectiveDay: "2026-11-23",
    }]);
    const fresh = await t.run((ctx) => officialCatalogForDay(ctx, "openai", usage.day, tomorrow));
    const stale = await t.run((ctx) => officialCatalogForDay(ctx, "openai", usage.day, Date.parse("2026-11-26")));
    expect(fresh?.models).toEqual([original]);
    expect(stale).toBeNull();
  });

  test("quotes eligible estimates with provenance and leaves reported charges and ambiguous usage alone", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.officialPricing.recordObservation, {
      provider: "openai", observedAt, revision: digest, models: [{ ...original, through: usage.day }],
    });
    const catalog = await t.run((ctx) => officialCatalogForDay(ctx, "openai", usage.day, tomorrow));
    const card = officialRateCard(catalog, usage.model, usage.day);
    const quote = automaticSnapshotPrice(usage, card);
    expect(quote?.costMicros).toBe(600);
    expect(quote?.pricingVersion).toContain("official-observed-v1:openai:2026-11-23:");
    expect(automaticSnapshotPrice({ ...usage, costBasis: "reported" }, card)).toBeNull();
    expect(automaticSnapshotPrice({ ...usage, cacheReadTokens: 1, totalTokens: 141 }, card)).toBeNull();
    expect(automaticSnapshotPrice({ ...usage, day: "2026-11-22" }, card)).toBeNull();
    expect(officialRateCard(catalog, usage.model, "2026-11-24")).toBeNull();
    expect(automaticSnapshotPrice({ ...usage, costMicros: 0 }, null)).toBeNull();
    expect(automaticSnapshotPrice({ ...usage, priceCorrection: {
      originalCostMicros: 100, rateCardVersion: quote!.pricingVersion, appliedAt: tomorrow,
    } })).toBeNull();
  });
});
