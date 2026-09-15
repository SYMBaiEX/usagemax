/** Fixed teaching examples, not an ingestion calculator or a provider rate card. */
export const accountingExamples = {
  complete: {
    label: "Complete", state: "Counted", input: 1200, output: 800, total: 2000,
    added: 2000, unclassified: 0,
    payload: { eventKey: "request_01", inputTokens: 1200, outputTokens: 800, totalTokens: 2000 },
    explanation: "The reported total matches the breakdown. All 2,000 tokens are classified.",
    formula: "1,200 input + 800 output = 2,000 tokens",
  },
  partial: {
    label: "Partial", state: "Counted · partial", input: 1200, output: 0, total: 2000,
    added: 2000, unclassified: 800,
    payload: { eventKey: "request_02", inputTokens: 1200, totalTokens: 2000 },
    explanation: "The source reports 2,000 tokens but only classifies 1,200. We keep the total; the remainder stays unclassified.",
    formula: "1,200 input + 800 unclassified = 2,000 tokens",
  },
  replay: {
    label: "Replayed", state: "Already counted", input: 1200, output: 800, total: 2000,
    added: 0, unclassified: 0,
    payload: { eventKey: "request_01", inputTokens: 1200, outputTokens: 800, totalTokens: 2000 },
    explanation: "The same collector sends the same event key and payload again. The original 2,000 tokens remain; the replay adds nothing.",
    formula: "2,000 already counted + 0 new = 2,000 tokens",
  },
} as const;

export type AccountingExample = keyof typeof accountingExamples;
