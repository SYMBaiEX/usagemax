import { v } from "convex/values";
import type { GatewayReceipt } from "./gatewayContract";
import { dayFromTimestamp } from "./lib";

const quantiles = v.object({ p50: v.number(), p95: v.number(), p99: v.number(), samples: v.number() });
export const gatewayMetrics = v.object({
  key: v.string(),
  requests: v.number(),
  errors: v.number(),
  cancelled: v.number(),
  pendingBilling: v.number(),
  providerAttempts: v.number(),
  providerErrors: v.number(),
  traces: v.number(),
  inputTokens: v.number(),
  outputTokens: v.number(),
  cachedTokens: v.number(),
  reasoningTokens: v.number(),
  customerChargeNanos: v.string(),
  knownProviderCostNanos: v.string(),
  coveredMarginNanos: v.string(),
  costCovered: v.number(),
  marginCovered: v.number(),
  invoiceConfirmed: v.number(),
  latency: v.union(v.null(), quantiles),
  firstToken: v.union(v.null(), quantiles),
  providerLatency: v.union(v.null(), quantiles),
});

export type GatewayMetrics = typeof gatewayMetrics.type;

type Accumulator = {
  counters: Omit<GatewayMetrics, "key" | "customerChargeNanos" | "knownProviderCostNanos" | "coveredMarginNanos" | "latency" | "firstToken" | "providerLatency">;
  latency: number[];
  firstToken: number[];
  providerLatency: number[];
  charged: bigint;
  cost: bigint;
  margin: bigint;
};

function accumulator(): Accumulator {
  return {
    counters: {
      requests: 0, errors: 0, cancelled: 0, pendingBilling: 0, providerAttempts: 0, providerErrors: 0,
      traces: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0, reasoningTokens: 0,
      costCovered: 0, marginCovered: 0, invoiceConfirmed: 0,
    },
    latency: [], firstToken: [], providerLatency: [], charged: BigInt(0), cost: BigInt(0), margin: BigInt(0),
  };
}

type Span = NonNullable<GatewayReceipt["trace"]>["spans"][number];

function attempt(target: Accumulator, span: Span) {
  target.counters.providerAttempts++;
  target.providerLatency.push(span.endedAt - span.startedAt);
  if (span.status === "error") target.counters.providerErrors++;
}

function sample(target: Accumulator, row: GatewayReceipt, includeAttempts: boolean) {
  const c = target.counters;
  c.requests++;
  if (row.status === "error") c.errors++;
  if (row.status === "cancelled") c.cancelled++;
  if (row.trace?.billingStatus === "pending") c.pendingBilling++;
  if (row.trace) {
    c.traces++;
    if (includeAttempts) {
      for (const span of row.trace.spans) if (span.kind === "provider") attempt(target, span);
    }
  }
  const cache = (row.usage.cacheReadTokens ?? 0) + (row.usage.cacheWriteTokens ?? 0);
  c.inputTokens += (row.usage.inputTokens ?? 0) + cache;
  c.outputTokens += (row.usage.outputTokens ?? 0) + (row.usage.reasoningTokens ?? 0);
  c.cachedTokens += cache;
  c.reasoningTokens += row.usage.reasoningTokens ?? 0;
  if (row.startedAt !== undefined) {
    target.latency.push(row.settledAt - row.startedAt);
    if (row.firstTokenAt !== undefined) target.firstToken.push(row.firstTokenAt - row.startedAt);
  }
  if (row.customerChargeNanos !== null) target.charged += BigInt(row.customerChargeNanos);
  if (row.providerCostNanos !== null && (row.providerCostBasis === "provider_reported" || row.providerCostBasis === "invoice_confirmed")) {
    c.costCovered++;
    target.cost += BigInt(row.providerCostNanos);
    if (row.customerChargeNanos !== null) {
      c.marginCovered++;
      target.margin += BigInt(row.customerChargeNanos) - BigInt(row.providerCostNanos);
    }
    if (row.providerCostBasis === "invoice_confirmed") c.invoiceConfirmed++;
  }
}

function percentiles(values: number[]) {
  if (!values.length) return null;
  values.sort((a, b) => a - b);
  const at = (percent: number) => values[Math.ceil(values.length * percent) - 1];
  return { samples: values.length, p50: at(0.50), p95: at(0.95), p99: at(0.99) };
}

function summarize(key: string, row: Accumulator): GatewayMetrics {
  return {
    key, ...row.counters,
    customerChargeNanos: String(row.charged), knownProviderCostNanos: String(row.cost), coveredMarginNanos: String(row.margin),
    latency: percentiles(row.latency), firstToken: percentiles(row.firstToken), providerLatency: percentiles(row.providerLatency),
  };
}

function groupFor(map: Map<string, Accumulator>, key: string) {
  let value = map.get(key);
  if (!value) {
    value = accumulator();
    map.set(key, value);
  }
  return value;
}

export function aggregateGateway(rows: GatewayReceipt[]) {
  const daily = new Map<string, Accumulator>();
  const providers = new Map<string, Accumulator>();
  const models = new Map<string, Accumulator>();
  const overall = accumulator();
  for (const row of rows) {
    sample(overall, row, true);
    sample(groupFor(daily, dayFromTimestamp(row.settledAt)), row, true);
    sample(groupFor(providers, row.provider), row, false);
    sample(groupFor(models, row.model), row, true);
    for (const span of row.trace?.spans ?? []) {
      if (span.kind === "provider") attempt(groupFor(providers, span.provider ?? row.provider), span);
    }
  }
  const group = (map: Map<string, Accumulator>) => [...map]
    .sort((a, b) => b[1].counters.requests - a[1].counters.requests || b[1].counters.providerAttempts - a[1].counters.providerAttempts || a[0].localeCompare(b[0]))
    .slice(0, 100).map(([key, value]) => summarize(key, value));
  return {
    overall: summarize("all", overall),
    daily: group(daily).sort((a, b) => a.key.localeCompare(b.key)),
    providers: group(providers),
    models: group(models),
    groupsTruncated: models.size > 100 || providers.size > 100,
  };
}
