import { describe, expect, it } from "vitest";
import {
  findVerifiedRateCard,
  legacyGrok47GovCloudEstimateMicros,
  verifiedEstimatedCost,
  type VerifiedCostInput,
} from "./verifiedModelPricing";

const sample = {
  provider: "openai",
  model: "gpt-6.2-astra",
  day: "2026-11-18",
  costBasis: "estimated",
  inputTokens: 100,
  outputTokens: 20,
  cacheReadTokens: 10,
  totalTokens: 130,
  evidence: { standardGlobalText: true },
} satisfies VerifiedCostInput;

function quote(overrides: Partial<VerifiedCostInput> = {}) {
  return verifiedEstimatedCost({ ...sample, ...overrides });
}

describe("verified first-party pricing", () => {
  it.each([
    ["openai", "gpt-6.2-astra", "2026-11-18", 8, 40, 0.4],
    ["openai", "gpt-6.2-sol", "2026-11-18", 2, 10, 0.1],
    ["openai", "gpt-6.2-astra-law", "2026-11-18", 8, 40, 0.4],
    ["openai", "gpt-6.1-terra", "2026-10-27", 1, 5, 0.05],
    ["openai", "gpt-6.1-sol", "2026-09-30", 2, 10, 0.1],
    ["openai", "gpt-6-astra", "2026-09-04", 10, 50, 1],
    ["openai", "gpt-6-sol", "2026-09-23", 2, 10, 0.2],
    ["openai", "gpt-6-luna", "2026-09-23", 0.1, 0.5, 0.01],
    ["anthropic", "claude-fable-5-2", "2026-11-10", 8, 40, 0.2],
    ["anthropic", "claude-fable-5-1", "2026-09-16", 10, 50, 0.25],
    ["anthropic", "claude-fable-5", "2026-07-02", 10, 50, 1],
    ["anthropic", "claude-mythos-5-2", "2026-11-10", 8, 40, 0.2],
    ["anthropic", "claude-mythos-5-1", "2026-09-16", 10, 50, 0.25],
    ["anthropic", "claude-mythos-5", "2026-07-02", 10, 50, 1],
    ["anthropic", "claude-opus-5-5", "2026-09-23", 4, 20, 0.2],
    ["anthropic", "claude-opus-5", "2026-07-25", 5, 25, 0.5],
    ["anthropic", "claude-sonnet-5-5", "2026-10-08", 2, 10, 0.1],
    ["anthropic", "claude-sonnet-5", "2026-06-09", 2, 10, 0.2],
    ["anthropic", "claude-haiku-5-5", "2026-10-08", 0.1, 0.5, 0.01],
    ["xai", "grok-4.7", "2026-09-22", 2, 6, 0.5],
  ])("uses exact documented rates for %s %s", (provider, model, day, input, output, cacheRead) => {
    expect(findVerifiedRateCard(provider, model, day)?.standard).toMatchObject({ input, output, cacheRead });
  });

  it("leaves launch and price cutover days uncovered", () => {
    expect(findVerifiedRateCard("openai", "gpt-6.2-astra", "2026-11-17")).toBeNull();
    expect(findVerifiedRateCard("openai", "gpt-5.6-sol", "2026-08-20")?.standard.input).toBe(5);
    expect(findVerifiedRateCard("openai", "gpt-5.6-sol", "2026-08-21")).toBeNull();
    expect(findVerifiedRateCard("openai", "gpt-5.6-sol", "2026-08-22")?.standard.input).toBe(4);
    expect(findVerifiedRateCard("openai", "gpt-5.6-sol", "2026-11-29")?.standard.input).toBe(4);
    expect(findVerifiedRateCard("openai", "gpt-5.6-sol", "2026-11-30")).toBeNull();
    expect(findVerifiedRateCard("openai", "gpt-6.2-astra-law", "2027-01-01")).toBeNull();
    expect(findVerifiedRateCard("openai", "gpt-5.6-terra", "2026-07-29")?.standard.output).toBe(15);
    expect(findVerifiedRateCard("openai", "gpt-5.6-terra", "2026-07-30")).toBeNull();
    expect(findVerifiedRateCard("openai", "gpt-5.6-terra", "2026-07-31")?.standard.output).toBe(12);
    expect(findVerifiedRateCard("openai", "gpt-5.6-luna", "2026-07-29")?.standard.output).toBe(6);
    expect(findVerifiedRateCard("openai", "gpt-5.6-luna", "2026-07-30")).toBeNull();
    expect(findVerifiedRateCard("openai", "gpt-5.6-luna", "2026-07-31")?.standard.output).toBe(1.2);
    expect(findVerifiedRateCard("anthropic", "claude-sonnet-5-5", "2026-10-06")?.standard.cacheRead).toBe(0.2);
    expect(findVerifiedRateCard("anthropic", "claude-sonnet-5-5", "2026-10-07")).toBeNull();
    expect(findVerifiedRateCard("anthropic", "claude-sonnet-5-5", "2026-10-08")?.standard.cacheRead).toBe(0.1);
  });

  it("honors the Fable 5 availability interruption", () => {
    expect(findVerifiedRateCard("anthropic", "claude-fable-5", "2026-06-11")).not.toBeNull();
    expect(findVerifiedRateCard("anthropic", "claude-fable-5", "2026-06-12")).toBeNull();
    expect(findVerifiedRateCard("anthropic", "claude-fable-5", "2026-07-01")).toBeNull();
    expect(findVerifiedRateCard("anthropic", "claude-fable-5", "2026-07-02")).not.toBeNull();
  });

  it.each([
    { provider: "azure" },
    { provider: "bedrock", model: "grok-4.7" },
    { model: "openai/gpt-6.2-astra" },
    { model: "gpt-6.2-astra-fast" },
    { model: "GPT-6.2-Astra" },
    { provider: "xai", model: "grok-4.7-latest" },
    { provider: "xai", model: "us-gov.xai.grok-4.7" },
    { day: "2026-11-31" },
    { day: "2026-11-18T00:00:00Z" },
  ])("rejects unverified identities or dates %j", (overrides) => {
    expect(quote(overrides)).toBeNull();
  });

  it("limits use to verified estimates and requested API-equivalent values", () => {
    expect(quote()).toEqual({
      costMicros: 1604,
      pricingVersion: "standard-direct-v1:openai/gpt-6.2-astra:2026-11-18:short",
      pricingSource: "https://developers.openai.com/api/docs/pricing",
    });
    expect(quote({ costBasis: "api-equivalent" })).toEqual(quote());
    for (const costBasis of ["reported", "unknown", "mixed", undefined]) {
      expect(quote({ costBasis })).toBeNull();
    }
    expect(quote({ evidence: undefined })).toBeNull();
  });

  it("requires all tokens to be accounted for in disjoint, safe integer buckets", () => {
    expect(quote({ reasoningTokens: 10, totalTokens: 140 })?.costMicros).toBe(2004);
    expect(quote({ reasoningTokens: 10 })).toBeNull();
    expect(quote({ unclassifiedTokens: 1, totalTokens: 131 })).toBeNull();
    expect(quote({ inputTokens: 100.5, totalTokens: 130.5 })).toBeNull();
    expect(quote({ inputTokens: -100, totalTokens: 130 })).toBeNull();
    expect(quote({ totalTokens: Number.MAX_SAFE_INTEGER + 1 })).toBeNull();
    expect(quote({ outputTokens: Number.MAX_SAFE_INTEGER, inputTokens: 0, cacheReadTokens: 0, totalTokens: Number.MAX_SAFE_INTEGER })).toBeNull();
  });

  it("uses inclusive OpenAI tier bounds and requires evidence for aggregate long-context cost", () => {
    const counts = { inputTokens: 271_990, totalTokens: 272_020 };
    expect(quote(counts)?.pricingVersion).toMatch(/:short$/);
    const above = { inputTokens: 271_991, totalTokens: 272_021 };
    expect(quote(above)).toBeNull();
    expect(quote({ ...above, evidence: { standardGlobalText: true, maxInputTokensPerRequest: 100_000 } })?.pricingVersion).toMatch(/:short$/);
    expect(quote({ ...above, evidence: { standardGlobalText: true, minInputTokensPerRequest: 272_001 } })?.pricingVersion).toMatch(/:long$/);
    expect(quote({ ...above, evidence: { standardGlobalText: true, minInputTokensPerRequest: 273_000 } })).toBeNull();
    expect(quote({ ...above, evidence: { standardGlobalText: true, singleRequest: true, maxInputTokensPerRequest: 100_000 } })).toBeNull();
    expect(quote({ ...above, evidence: { standardGlobalText: true, singleRequest: true } })?.costMicros).toBe(4_353_064);
  });

  it("verifies thresholds independently for Grok and Haiku", () => {
    const grok = { provider: "xai", model: "grok-4.7", inputTokens: 199_989, totalTokens: 200_019 };
    expect(quote(grok)?.pricingVersion).toMatch(/:short$/);
    expect(quote({ ...grok, inputTokens: 199_990, totalTokens: 200_020 })).toBeNull();
    expect(quote({ ...grok, inputTokens: 199_990, totalTokens: 200_020, evidence: { standardGlobalText: true, singleRequest: true } })?.pricingVersion).toMatch(/:long$/);
    const haiku = { provider: "anthropic", model: "claude-haiku-5-5", inputTokens: 99_990, totalTokens: 100_020 };
    expect(quote(haiku)?.pricingVersion).toMatch(/:short$/);
    expect(quote({ ...haiku, inputTokens: 99_991, totalTokens: 100_021 })).toBeNull();
  });

  it("requires every cache write to have explicit, supported TTL evidence", () => {
    const withWrites = { cacheWriteTokens: 10, totalTokens: 140 };
    expect(quote(withWrites)).toBeNull();
    expect(quote({ ...withWrites, evidence: { standardGlobalText: true, cacheWriteTokensByTtl: { "30m": 9 } } })).toBeNull();
    expect(quote({ ...withWrites, evidence: { standardGlobalText: true, cacheWriteTokensByTtl: { "5m": 10 } } })).toBeNull();
    expect(quote({ ...withWrites, evidence: { standardGlobalText: true, cacheWriteTokensByTtl: { "30m": 6, "12h": 4 } } })?.costMicros).toBe(1744);
    expect(quote({
      ...withWrites,
      model: "gpt-6.1-sol",
      day: "2026-10-20",
      evidence: { standardGlobalText: true, cacheWriteTokensByTtl: { "12h": 10 } },
    })).toBeNull();
    expect(findVerifiedRateCard("openai", "gpt-6.1-sol", "2026-10-20")?.standard.cacheWrite).not.toHaveProperty("12h");
    expect(findVerifiedRateCard("openai", "gpt-6.1-sol", "2026-10-21")?.standard.cacheWrite?.["12h"]).toBe(5);
    expect(quote({
      ...withWrites,
      provider: "anthropic",
      model: "claude-opus-5-5",
      evidence: { standardGlobalText: true, cacheWriteTokensByTtl: { "5m": 6, "1h": 4 } },
    })?.costMicros).toBe(864);
  });

  it("rounds the summed token charges once", () => {
    const tiny = { provider: "anthropic", model: "claude-haiku-5-5", inputTokens: 4, outputTokens: 0, cacheReadTokens: 9 };
    expect(quote({ ...tiny, totalTokens: 13 })?.costMicros).toBe(0);
    expect(quote({ ...tiny, totalTokens: 14, cacheReadTokens: 10 })?.costMicros).toBe(1);
  });

  it("produces a deterministic baseline for identifying the old Grok estimate", () => {
    expect(legacyGrok47GovCloudEstimateMicros(sample)).toBe(429);
    expect(legacyGrok47GovCloudEstimateMicros({ ...sample, cacheWriteTokens: 1, totalTokens: 131 })).toBeNull();
    expect(legacyGrok47GovCloudEstimateMicros({ ...sample, totalTokens: 129 })).toBeNull();
    expect(quote({ provider: "xai", model: "grok-4.7" })?.costMicros).toBe(325);
  });
});
