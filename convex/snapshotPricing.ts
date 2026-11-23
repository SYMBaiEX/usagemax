import type { Doc } from "./_generated/dataModel";
import { legacyGrok47GovCloudEstimateMicros, verifiedEstimatedCost, type VerifiedRateCard } from "./verifiedModelPricing";

type Snapshot = Doc<"collectorUsageSnapshots">;
type PriceInput = Pick<Snapshot, "source" | "provider" | "model" | "day" | "pricingVersion" | "costBasis"
  | "inputTokens" | "outputTokens" | "cacheReadTokens" | "cacheWriteTokens" | "reasoningTokens"
  | "unclassifiedTokens" | "totalTokens" | "costMicros" | "priceCorrection">;

const parserVersion = /^ccusage@20\.0\.\d+(?::(?:bundled|live-with-bundled-fallback)(?::direct-v1)?)?$/;

function isKnownGrokOverestimate(row: PriceInput) {
  if (row.provider !== "xai" || row.model !== "grok-4.7"
    || row.costBasis !== "estimated" || row.pricingVersion?.endsWith(":direct-v1")
    || row.inputTokens + row.cacheReadTokens >= 200_000) return false;
  // Match the old GovCloud tariff before treating the amount as incorrect.
  return row.costMicros === legacyGrok47GovCloudEstimateMicros(row);
}

export function automaticSnapshotPrice(row: PriceInput, observedCard?: VerifiedRateCard | null) {
  if (observedCard === null || row.costBasis === "reported" || !parserVersion.test(row.pricingVersion ?? "")) return null;
  if (!observedCard && row.priceCorrection?.rateCardVersion.startsWith("official-observed-v1:")) return null;
  const direct = (row.source === "codex" && row.provider === "openai")
    || (row.source === "claude" && row.provider === "anthropic")
    || (row.provider === "xai" && row.model === "grok-4.7" && row.priceCorrection !== undefined);
  const missingEstimate = row.costMicros === 0 && row.totalTokens > 0;
  if (!isKnownGrokOverestimate(row) && !(direct && (observedCard || missingEstimate || row.priceCorrection !== undefined))) return null;

  const quote = verifiedEstimatedCost({
    ...row,
    costBasis: "api-equivalent",
    evidence: { standardGlobalText: true },
  }, observedCard);
  return quote && quote.costMicros > 0 ? quote : null;
}
