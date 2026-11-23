import { describe, expect, test } from "vitest";
import { parseOfficialRateCatalog } from "./officialPriceCatalog";
import { verifiedEstimatedCost } from "./verifiedModelPricing";

const openAiSol = "| gpt-5.6-sol | $4.00 | $20.00 | $0.40 | $5.00 | $10.00 | $8.00 | $30.00 | $0.80 | $10.00 | $20.00 |";
const openAiPro = "| gpt-5.2-pro | $21.00 | $168.00 | - |";
const openAiPromotion = "GPT-5.6 Sol’s promotional pricing is available until November 30, 2026.";
const openAiDocument = [
  "# Pricing",
  "Prices per 1M tokens.",
  "### Standard pricing data",
  "| Model | Short context input | Short context output | Short context cached input | Short context 30m write | Short context 12h write | Long context input | Long context output | Long context cached input | Long context 30m write | Long context 12h write |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  openAiSol,
  "| gpt-5.5 (<272K context length) | $5.00 | $30.00 | $0.50 | - | - | $10.00 | $45.00 | $1.00 | - | - |",
  "",
  "| Model | Input | Output | Cached input |",
  "| --- | --- | --- | --- |",
  openAiPro,
  "| gpt-5.4-mini | $0.75 | $4.50 | $0.075 |",
  "",
  "### Batch pricing data",
  "| Model | Input | Output | Cached input |",
  "| --- | --- | --- | --- |",
  "| gpt-5.4-mini | $0.375 | $2.25 | $0.0375 |",
  "",
  "Short context: ≤272K input tokens. Long context: >272K input tokens.",
  openAiPromotion,
].join("\n");

const anthropicHaikuShort = "| Claude Haiku 5.5 (for prompts up to 100,000 tokens) | $0.10 / MTok | $0.125 / MTok | $0.20 / MTok | $0.01 / MTok | $0.50 / MTok |";
const anthropicHaikuLong = "| Claude Haiku 5.5 (for prompts over 100,000 tokens) | $0.50 / MTok | $0.625 / MTok | $1 / MTok | $0.05 / MTok | $2.50 / MTok |";
const anthropicDocument = [
  "# Pricing",
  "All prices are in USD.",
  "## Model pricing",
  "| Model | Base input tokens | 5m cache writes | 1h cache writes | Cache hits and refreshes | Output tokens |",
  "| :---- | :---- | :---- | :---- | :---- | :---- |",
  "| Claude Mythos 5.2 ([limited availability](https://support.claude.com/en/articles/14604842)) | $8 / MTok | $10 / MTok | $16 / MTok | $0.20 / MTok<sup>1</sup> | $40 / MTok |",
  "| Claude Sonnet 4.5 | $3 / MTok | $3.75 / MTok | $6 / MTok | $0.30 / MTok | $15 / MTok |",
  "| Claude Opus 4 ([retired, except on Claude Models on Google Cloud (Google managed)](https://platform.claude.com/docs/en/about-claude/model-deprecations)) | $15 / MTok | $18.75 / MTok | $30 / MTok | $1.50 / MTok | $75 / MTok |",
  anthropicHaikuLong,
  anthropicHaikuShort,
  "",
  "## Cloud platform pricing",
  "| Model | Base input tokens | 5m cache writes | 1h cache writes | Cache hits and refreshes | Output tokens |",
  "| :---- | :---- | :---- | :---- | :---- | :---- |",
  "| Claude Sonnet 4.5 | $9 / MTok | $9 / MTok | $9 / MTok | $9 / MTok | $9 / MTok |",
].join("\n");

describe("official OpenAI pricing", () => {
  test("uses both Standard tables without importing a cheaper service tier", () => {
    const rows = parseOfficialRateCatalog("openai", openAiDocument);
    expect(rows.map(({ model }) => model)).toEqual(["gpt-5.2-pro", "gpt-5.4-mini", "gpt-5.5", "gpt-5.6-sol"]);
    expect(rows[0].standard.cacheRead).toBeNull();
    expect(rows[1].standard).toEqual({ input: 0.75, output: 4.5, cacheRead: 0.075 });
    expect(rows[2].context).toEqual({ shortMax: 272_000, long: { input: 10, output: 45, cacheRead: 1 } });
    expect(rows[3]).toEqual({
      model: "gpt-5.6-sol",
      through: "2026-11-29",
      standard: { input: 4, output: 20, cacheRead: 0.4, cacheWrite: { "30m": 5, "12h": 10 } },
      context: {
        shortMax: 272_000,
        long: { input: 8, output: 30, cacheRead: 0.8, cacheWrite: { "30m": 10, "12h": 20 } },
      },
    });
  });

  test("includes specialized Standard rates, promotion dates, and explicitly unpriced long tiers", () => {
    const specialized = [
      "Specialized models",
      "Standard",
      "| Category | Model | Input | Output | Cached input | 30m write | 12h write |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      "| Legal model configurations | gpt-6.2-astra-law (short context) | $8.00 | $40.00 | $0.40 | $10.00 | $20.00 |",
      "| Legal model configurations | gpt-6.2-astra-law (long context) | $16.00 | $60.00 | $0.80 | $20.00 | $40.00 |",
      "| Legal model configurations | gpt-6-astra-law (short context) | $10.00 | $50.00 | $1.00 | - | - |",
      "| Legal model configurations | gpt-6-astra-law (long context) | - | - | - | - | - |",
      "| Codex | gpt-5.3-codex | $1.75 | $14.00 | $0.175 | - | - |",
      "",
      "GPT-6 Astra for Law and GPT-6.2 Astra for Law promotional pricing is available at least through December 31, 2026.",
      "Fast",
      "| Category | Model | Input | Output | Cached input |",
      "| --- | --- | --- | --- | --- |",
      "| Codex | gpt-5.3-codex | $3.50 | $28.00 | $0.35 |",
    ].join("\n");
    const rows = parseOfficialRateCatalog("openai", openAiDocument + "\n" + specialized);
    expect(rows.find(({ model }) => model === "gpt-5.3-codex")?.standard.input).toBe(1.75);
    expect(rows.find(({ model }) => model === "gpt-6.2-astra-law")).toMatchObject({
      through: "2026-12-30", context: { shortMax: 272_000, long: { input: 16, output: 60 } },
    });
    const entry = rows.find(({ model }) => model === "gpt-6-astra-law")!;
    expect(entry.context).toEqual({ shortMax: 272_000, long: null });
    const card = { ...entry, from: "2026-11-24", pricingSource: "official", pricingVersion: "fixture" };
    const quote = (tokens: number) => verifiedEstimatedCost({
      model: entry.model, provider: "openai", day: card.from, costBasis: "estimated",
      evidence: { standardGlobalText: true, singleRequest: true },
      inputTokens: tokens, outputTokens: 0, cacheReadTokens: 0, totalTokens: tokens,
    }, card);
    expect(quote(10)?.costMicros).toBe(100);
    expect(quote(272_001)).toBeNull();
  });

  test("keeps a known promotion bounded if the note disappears, until the rate changes", () => {
    const withoutNotice = openAiDocument.replace(openAiPromotion, "");
    expect(parseOfficialRateCatalog("openai", withoutNotice).find(({ model }) => model === "gpt-5.6-sol")?.through)
      .toBe("2026-11-29");
    const superseded = withoutNotice.replace("| gpt-5.6-sol | $4.00", "| gpt-5.6-sol | $5.00");
    expect(parseOfficialRateCatalog("openai", superseded).find(({ model }) => model === "gpt-5.6-sol")?.through)
      .toBeUndefined();
  });

  test.each([
    "",
    openAiDocument.replace("### Batch pricing data", ""),
    openAiDocument.replace("Short context: ≤272K input tokens. Long context: >272K input tokens.", ""),
    openAiDocument.replace("Cached input |", "Discounted amount |"),
    openAiDocument.replace(openAiPro, openAiPro + "\n" + openAiPro),
    openAiDocument.replace("$0.075", "€0.075"),
    openAiDocument.replace("$0.075 |", "$0.075"),
    openAiDocument.replace("November 30, 2026", "November 31, 2026"),
  ])("rejects incomplete, duplicate or invalid source %#", (document) => {
    expect(() => parseOfficialRateCatalog("openai", document)).toThrow("INVALID_OFFICIAL_PRICE_CATALOG");
  });
});

describe("official Anthropic pricing", () => {
  test("maps pinned model IDs, pairs prompt tiers, and skips retired/cloud rows", () => {
    const rows = parseOfficialRateCatalog("anthropic", anthropicDocument.replaceAll("\n", "\r\n"));
    expect(rows).toEqual([
      {
        model: "claude-haiku-5-5",
        standard: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: { "5m": 0.125, "1h": 0.2 } },
        context: {
          shortMax: 100_000,
          long: { input: 0.5, output: 2.5, cacheRead: 0.05, cacheWrite: { "5m": 0.625, "1h": 1 } },
        },
      },
      {
        model: "claude-mythos-5-2",
        standard: { input: 8, output: 40, cacheRead: 0.2, cacheWrite: { "5m": 10, "1h": 16 } },
      },
      {
        model: "claude-sonnet-4-5-20250929",
        standard: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: { "5m": 3.75, "1h": 6 } },
        through: "2026-11-29",
      },
    ]);
  });

  test.each([
    anthropicDocument.replace("## Cloud platform pricing", ""),
    anthropicDocument.replace("All prices are in USD.", "All prices are in EUR."),
    anthropicDocument.replace(anthropicHaikuShort, ""),
    anthropicDocument.replace(anthropicHaikuLong, anthropicHaikuLong.replace("100,000", "200,000")),
    anthropicDocument.replace(anthropicHaikuShort, anthropicHaikuShort + "\n" + anthropicHaikuShort),
    anthropicDocument.replace("$8 / MTok", "$8 / KTok"),
  ])("rejects incomplete, duplicate or invalid source %#", (document) => {
    expect(() => parseOfficialRateCatalog("anthropic", document)).toThrow("INVALID_OFFICIAL_PRICE_CATALOG");
  });
});
