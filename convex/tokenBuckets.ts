/** Public accounting projections use disjoint buckets; raw events keep provider semantics. */
export type TokenInput = {
  inputTokens: number; outputTokens: number; cacheReadTokens: number;
  cacheWriteTokens?: number; reasoningTokens: number; totalTokens: number; schemaVersion: number; pricingSource?: string; state?: string;
};
export const bucketFields = ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens", "reasoningTokens", "unclassifiedTokens"] as const;
export function eventBuckets(event: TokenInput) {
  const cacheReadTokens = event.cacheReadTokens;
  const cacheWriteTokens = event.cacheWriteTokens ?? 0;
  // Old HTTP adapters incorrectly stamped inclusive OTLP/native events v1.
  // Recover that basis only when the explicit total proves input+output.
  const legacyAggregate = event.state === "synced" && event.pricingSource === "ccusage / LiteLLM";
  const inclusive = event.schemaVersion >= 2 || (!legacyAggregate && event.totalTokens === event.inputTokens + event.outputTokens);
  const inputTokens = event.inputTokens - (inclusive ? cacheReadTokens + cacheWriteTokens : 0);
  const outputTokens = event.outputTokens - event.reasoningTokens;
  const classified = inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens + event.reasoningTokens;
  // A contradictory provider total cannot support a made-up category split.
  if (inputTokens < 0 || outputTokens < 0 || classified > event.totalTokens) {
    return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
      reasoningTokens: 0, unclassifiedTokens: event.totalTokens };
  }
  return { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens,
    reasoningTokens: event.reasoningTokens, unclassifiedTokens: event.totalTokens - classified };
}
export function legacyEventBuckets(event: TokenInput) {
  return { inputTokens: event.inputTokens, outputTokens: event.outputTokens,
    cacheReadTokens: event.cacheReadTokens, cacheWriteTokens: event.cacheWriteTokens ?? 0,
    reasoningTokens: event.reasoningTokens, unclassifiedTokens: Math.max(0, event.totalTokens - event.inputTokens
      - event.outputTokens - (event.schemaVersion >= 2 ? 0 : event.cacheReadTokens + (event.cacheWriteTokens ?? 0))) };
}
