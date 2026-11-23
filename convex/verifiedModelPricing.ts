// Reviewed first-party Standard, global, text rates in USD per million tokens.
// Effective days are full UTC days. Announced launch and price-change days are
// excluded when the effective instant is unavailable.
const OPENAI_PRICING = "https://developers.openai.com/api/docs/pricing";
const ANTHROPIC_PRICING = "https://platform.claude.com/docs/en/about-claude/pricing";
const XAI_PRICING = "https://docs.x.ai/developers/pricing";
const OPENAI_12H_FROM = "2026-10-21";

type CacheTtl = "5m" | "1h" | "30m" | "12h";

export type VerifiedTokenCounts = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  unclassifiedTokens?: number;
  totalTokens: number;
};

type Rates = Readonly<{
  input: number;
  output: number;
  cacheRead: number | null;
  cacheWrite?: Readonly<Partial<Record<CacheTtl, number>>>;
}>;

type ContextTier = Readonly<{ shortMax: number; long: Rates }>;
type RatePeriod = Readonly<{
  from: string;
  through?: string;
  standard: Rates;
  context?: ContextTier;
  pricingSource: string;
}>;

export type VerifiedRateCard = RatePeriod & Readonly<{ pricingVersion: string }>;

export type StandardPricingEvidence = {
  standardGlobalText: true;
  singleRequest?: boolean;
  minInputTokensPerRequest?: number;
  maxInputTokensPerRequest?: number;
  cacheWriteTokensByTtl?: Partial<Record<CacheTtl, number>>;
};

export type VerifiedCostInput = VerifiedTokenCounts & {
  provider: string;
  model: string;
  day: string;
  costBasis?: string;
  evidence: StandardPricingEvidence;
};

function openAiPeriod(
  from: string,
  input: number,
  output: number,
  cacheRead: number,
  through?: string,
): RatePeriod {
  return {
    from, through, pricingSource: OPENAI_PRICING,
    standard: { input, output, cacheRead, cacheWrite: { "30m": input * 1.25, "12h": input * 2.5 } },
    context: {
      shortMax: 272_000,
      long: {
        input: input * 2, output: output * 1.5, cacheRead: cacheRead * 2,
        cacheWrite: { "30m": input * 2.5, "12h": input * 5 },
      },
    },
  };
}

function anthropicRates(input: number, output: number, cacheRead: number): Rates {
  return { input, output, cacheRead, cacheWrite: { "5m": input * 1.25, "1h": input * 2 } };
}

function anthropicPeriod(
  from: string,
  input: number,
  output: number,
  cacheRead: number,
  through?: string,
): RatePeriod {
  return { from, through, standard: anthropicRates(input, output, cacheRead), pricingSource: ANTHROPIC_PRICING };
}

// OpenAI launches and changes: https://developers.openai.com/api/docs/changelog
// Anthropic launches: https://www.anthropic.com/news/models
// xAI launch: https://docs.x.ai/developers/release-notes
const RATE_CARDS = new Map<string, readonly RatePeriod[]>([
  ["openai/gpt-6.2-astra", [openAiPeriod("2026-11-18", 8, 40, 0.4)]],
  ["openai/gpt-6.2-sol", [openAiPeriod("2026-11-18", 2, 10, 0.1)]],
  ["openai/gpt-6-astra", [openAiPeriod("2026-09-04", 10, 50, 1)]],
  ["openai/gpt-6.1-sol", [openAiPeriod("2026-09-30", 2, 10, 0.1)]],
  ["openai/gpt-6.1-terra", [openAiPeriod("2026-10-27", 1, 5, 0.05)]],
  ["openai/gpt-6-luna", [openAiPeriod("2026-09-23", 0.1, 0.5, 0.01)]],
  ["openai/gpt-6-sol", [openAiPeriod("2026-09-23", 2, 10, 0.2)]],
  // https://openai.com/index/astra-law-6-2/ and the published promotion window.
  ["openai/gpt-6.2-astra-law", [openAiPeriod("2026-11-18", 8, 40, 0.4, "2026-12-31")]],
  ["openai/gpt-5.6-sol", [
    openAiPeriod("2026-07-10", 5, 30, 0.5, "2026-08-20"),
    openAiPeriod("2026-08-22", 4, 20, 0.4, "2026-11-29"),
  ]],
  ["openai/gpt-5.6-terra", [
    openAiPeriod("2026-07-10", 2.5, 15, 0.25, "2026-07-29"),
    openAiPeriod("2026-07-31", 2, 12, 0.2),
  ]],
  ["openai/gpt-5.6-luna", [
    openAiPeriod("2026-07-10", 1, 6, 0.1, "2026-07-29"),
    openAiPeriod("2026-07-31", 0.2, 1.2, 0.02),
  ]],
  ["anthropic/claude-fable-5-2", [anthropicPeriod("2026-11-10", 8, 40, 0.2)]],
  ["anthropic/claude-fable-5-1", [anthropicPeriod("2026-09-16", 10, 50, 0.25)]],
  ["anthropic/claude-mythos-5-2", [anthropicPeriod("2026-11-10", 8, 40, 0.2)]],
  ["anthropic/claude-mythos-5-1", [anthropicPeriod("2026-09-16", 10, 50, 0.25)]],
  // The Claude API suspended Fable 5 on June 12 and restored it July 1.
  // https://www.anthropic.com/news/redeploying-fable-5
  ["anthropic/claude-fable-5", [
    anthropicPeriod("2026-06-10", 10, 50, 1, "2026-06-11"),
    anthropicPeriod("2026-07-02", 10, 50, 1),
  ]],
  ["anthropic/claude-mythos-5", [
    anthropicPeriod("2026-06-10", 10, 50, 1, "2026-06-11"),
    anthropicPeriod("2026-07-02", 10, 50, 1),
  ]],
  ["anthropic/claude-opus-5-5", [anthropicPeriod("2026-09-23", 4, 20, 0.2)]],
  ["anthropic/claude-opus-5", [anthropicPeriod("2026-07-25", 5, 25, 0.5)]],
  ["anthropic/claude-sonnet-5-5", [
    anthropicPeriod("2026-09-29", 2, 10, 0.2, "2026-10-06"),
    anthropicPeriod("2026-10-08", 2, 10, 0.1),
  ]],
  ["anthropic/claude-sonnet-5", [anthropicPeriod("2026-06-09", 2, 10, 0.2)]],
  ["anthropic/claude-haiku-5-5", [{
    ...anthropicPeriod("2026-10-08", 0.1, 0.5, 0.01),
    context: { shortMax: 100_000, long: anthropicRates(0.5, 2.5, 0.05) },
  }]],
  ["xai/grok-4.7", [{
    from: "2026-09-22", pricingSource: XAI_PRICING,
    standard: { input: 2, output: 6, cacheRead: 0.5 },
    context: { shortMax: 199_999, long: { input: 4, output: 12, cacheRead: 1 } },
  }]],
]);

function isUtcDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const timestamp = Date.parse(day);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === day;
}

function openAiBeforeTwelveHourWrites(rates: Rates): Rates {
  return { ...rates, cacheWrite: { "30m": rates.cacheWrite?.["30m"] } };
}

export function findVerifiedRateCard(provider: string, model: string, day: string): VerifiedRateCard | null {
  if (!isUtcDay(day)) return null;
  const key = `${provider}/${model}`;
  const period = RATE_CARDS.get(key)?.find(({ from, through }) => from <= day && (!through || day <= through));
  if (!period) return null;
  const pricingVersion = `standard-direct-v1:${key}:${period.from}`;
  // The October 20 launch day does not establish eligibility for the entire UTC day.
  if (provider === "openai" && day < OPENAI_12H_FROM) {
    return {
      ...period, pricingVersion, standard: openAiBeforeTwelveHourWrites(period.standard),
      context: period.context && { ...period.context, long: openAiBeforeTwelveHourWrites(period.context.long) },
    };
  }
  return { ...period, pricingVersion };
}

function isTokenCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function completeTokenCounts(tokens: VerifiedTokenCounts): number | null {
  const { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens = 0, reasoningTokens = 0, unclassifiedTokens = 0, totalTokens } = tokens;
  const counts = [inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, reasoningTokens, totalTokens];
  if (unclassifiedTokens !== 0 || !counts.every(isTokenCount) || totalTokens === 0) return null;
  if (inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens + reasoningTokens !== totalTokens) return null;
  return inputTokens + cacheReadTokens + cacheWriteTokens;
}

function contextRates(card: RatePeriod, dayInput: number, evidence: StandardPricingEvidence): { rates: Rates; tier: "short" | "long" | "flat" } | null {
  const { context, standard } = card;
  if (!context) return { rates: standard, tier: "flat" };
  const { minInputTokensPerRequest: lower = 0, maxInputTokensPerRequest: upper = dayInput, singleRequest } = evidence;
  if (!isTokenCount(lower) || !isTokenCount(upper) || lower > upper || lower > dayInput) return null;
  if (singleRequest && dayInput > upper) return null;
  if (Math.min(upper, dayInput) <= context.shortMax) return { rates: standard, tier: "short" };
  if (singleRequest || lower > context.shortMax) return { rates: context.long, tier: "long" };
  return null;
}

function writeCharges(
  count: number,
  rates: Rates["cacheWrite"],
  ttlCounts: StandardPricingEvidence["cacheWriteTokensByTtl"],
): Array<[number, number]> | null {
  if (!ttlCounts) return count === 0 ? [] : null;
  let classified = 0;
  const charges: Array<[number, number]> = [];
  for (const [ttl, tokens] of Object.entries(ttlCounts)) {
    if (ttl !== "5m" && ttl !== "1h" && ttl !== "30m" && ttl !== "12h") return null;
    if (!isTokenCount(tokens)) return null;
    classified += tokens;
    if (tokens === 0) continue;
    const rate = rates?.[ttl];
    if (rate === undefined) return null;
    charges.push([tokens, rate]);
  }
  return classified === count ? charges : null;
}

const RATE_SCALE = BigInt(10_000);

// USD per million tokens is numerically equal to micros per token.
function costMicros(tokens: VerifiedTokenCounts, rates: Rates, writes: Array<[number, number]>): number | null {
  if (rates.cacheRead === null && tokens.cacheReadTokens > 0) return null;
  const lines: Array<[number, number]> = [
    [tokens.inputTokens, rates.input],
    [tokens.outputTokens + (tokens.reasoningTokens ?? 0), rates.output],
    [tokens.cacheReadTokens, rates.cacheRead ?? 0],
    ...writes,
  ];
  const scaled = lines.reduce((sum, [quantity, rate]) => sum + BigInt(quantity) * BigInt(Math.round(rate * Number(RATE_SCALE))), BigInt(0));
  const cost = Number((scaled + RATE_SCALE / BigInt(2)) / RATE_SCALE);
  return Number.isSafeInteger(cost) ? cost : null;
}

/** The caller supplies documented direct Standard usage or explicitly requests an API-equivalent quote. */
export function verifiedEstimatedCost(
  input: VerifiedCostInput,
  observedCard?: VerifiedRateCard,
): { costMicros: number; pricingVersion: string; pricingSource: string } | null {
  if (input.costBasis !== "estimated" && input.costBasis !== "api-equivalent") return null;
  if (input.evidence?.standardGlobalText !== true) return null;
  if (observedCard && (!isUtcDay(input.day) || input.day < observedCard.from ||
      (observedCard.through && input.day > observedCard.through))) return null;
  const card = observedCard ?? findVerifiedRateCard(input.provider, input.model, input.day);
  const dayInput = completeTokenCounts(input);
  if (!card || dayInput === null) return null;
  const selection = contextRates(card, dayInput, input.evidence);
  if (!selection) return null;
  const writes = writeCharges(input.cacheWriteTokens ?? 0, selection.rates.cacheWrite, input.evidence.cacheWriteTokensByTtl);
  if (!writes) return null;
  const cost = costMicros(input, selection.rates, writes);
  return cost === null ? null : {
    costMicros: cost,
    pricingSource: card.pricingSource,
    pricingVersion: `${card.pricingVersion}:${selection.tier}`,
  };
}

/**
 * Fingerprint of the old LiteLLM GovCloud Standard row selected for bare Grok 4.7.
 * https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-xai-grok-4-7.html
 * This amount is only a signature for comparison with historical CLI estimates.
 */
export function legacyGrok47GovCloudEstimateMicros(tokens: VerifiedTokenCounts): number | null {
  if (completeTokenCounts(tokens) === null || (tokens.cacheWriteTokens ?? 0) !== 0) return null;
  return costMicros(tokens, { input: 2.64, output: 7.92, cacheRead: 0.66 }, []);
}
