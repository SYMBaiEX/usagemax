import { ConvexError, v } from "convex/values";

import { DAY_MS, MIN_EVENT_TIME, dayFromTimestamp } from "./lib";

export const gatewayScope = v.union(v.literal("ingest"), v.literal("report"));
export type GatewayScope = typeof gatewayScope.type;

const tokenCounters = [
  "inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens",
  "reasoningTokens", "reportedTotalTokens", "unclassifiedTokens",
] as const;
const usage = v.object({
  inputTokens: v.optional(v.number()),
  outputTokens: v.optional(v.number()),
  cacheReadTokens: v.optional(v.number()),
  cacheWriteTokens: v.optional(v.number()),
  reasoningTokens: v.optional(v.number()),
  reportedTotalTokens: v.optional(v.number()),
  unclassifiedTokens: v.optional(v.number()),
});

export const gatewayReceipt = v.object({
  schemaVersion: v.literal(1),
  requestId: v.string(),
  revision: v.number(),
  model: v.string(),
  provider: v.string(),
  status: v.union(v.literal("ok"), v.literal("error"), v.literal("cancelled")),
  settledAt: v.number(),
  startedAt: v.optional(v.number()),
  firstTokenAt: v.optional(v.number()),
  stream: v.optional(v.boolean()),
  resolvedModel: v.optional(v.string()),
  traceId: v.optional(v.string()),
  currency: v.literal("USD"),
  customerChargeNanos: v.union(v.number(), v.null()),
  providerCostNanos: v.union(v.number(), v.null()),
  providerCostBasis: v.union(v.literal("provider_reported"), v.literal("invoice_confirmed"), v.literal("estimated"), v.literal("unknown")),
  usage,
});

export type GatewayReceipt = typeof gatewayReceipt.type;
export const gatewayResult = v.object({
  requestId: v.string(),
  revision: v.number(),
  status: v.union(v.literal("accepted"), v.literal("replay"), v.literal("stale"), v.literal("conflict")),
});
export const gatewayRange = { from: v.string(), through: v.string(), limit: v.optional(v.number()) };
export const gatewayPage = v.object({ receipts: v.array(gatewayReceipt), truncated: v.boolean() });

export const gatewayLimits = { batch: 50, bytes: 65_536, days: 31, defaultLimit: 50, maximumLimit: 100 };

const OPAQUE_ID = /^[A-Za-z0-9_-][A-Za-z0-9_.:-]{0,119}$/;
const SLUG = /^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,119}$/;

export function isGatewayRequestId(value: unknown): value is string {
  return typeof value === "string" && OPAQUE_ID.test(value);
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function isSlug(value: unknown): value is string {
  return typeof value === "string" && SLUG.test(value);
}

function isCounter(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isTimestamp(value: unknown, now: number): value is number {
  return isCounter(value) && value >= MIN_EVENT_TIME && value <= now + 5 * 60_000;
}

function parseReceipt(value: unknown, now: number): GatewayReceipt | null {
  const raw = object(value);
  if (!raw || Object.keys(raw).some((key) => !Object.hasOwn(gatewayReceipt.fields, key))) return null;
  const rawUsage = object(raw.usage);
  if (!rawUsage || Object.keys(rawUsage).some((key) => !Object.hasOwn(usage.fields, key))) return null;
  const { schemaVersion, requestId, revision, model, provider, status, settledAt, startedAt, firstTokenAt, stream,
    resolvedModel, traceId, currency, customerChargeNanos, providerCostNanos, providerCostBasis } = raw;
  if (schemaVersion !== 1 || !isGatewayRequestId(requestId) || !isCounter(revision) || revision === 0
    || !isSlug(model) || !isSlug(provider) || !isTimestamp(settledAt, now) || currency !== "USD"
    || (status !== "ok" && status !== "error" && status !== "cancelled")
    || (customerChargeNanos !== null && !isCounter(customerChargeNanos))
    || (providerCostNanos !== null && !isCounter(providerCostNanos))
    || (providerCostBasis !== "provider_reported" && providerCostBasis !== "invoice_confirmed"
      && providerCostBasis !== "estimated" && providerCostBasis !== "unknown")) return null;
  if ((startedAt !== undefined && (!isTimestamp(startedAt, now) || startedAt > settledAt))
    || (firstTokenAt !== undefined && (!isTimestamp(firstTokenAt, now) || firstTokenAt > settledAt
      || (startedAt !== undefined && firstTokenAt < startedAt)))
    || (stream !== undefined && typeof stream !== "boolean")
    || (resolvedModel !== undefined && !isSlug(resolvedModel))
    || (traceId !== undefined && !isGatewayRequestId(traceId))) return null;

  const parsedUsage: GatewayReceipt["usage"] = {};
  for (const field of tokenCounters) {
    const count = rawUsage[field];
    if (count === undefined) continue;
    if (!isCounter(count)) return null;
    parsedUsage[field] = count;
  }

  // Construct the wire value in a fixed order so replays are independent of JSON key order.
  return {
    schemaVersion, requestId, revision, model, provider, status, settledAt,
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(firstTokenAt === undefined ? {} : { firstTokenAt }),
    ...(stream === undefined ? {} : { stream }),
    ...(resolvedModel === undefined ? {} : { resolvedModel }),
    ...(traceId === undefined ? {} : { traceId }),
    currency, customerChargeNanos, providerCostNanos, providerCostBasis, usage: parsedUsage,
  };
}

export function parseGatewayBatch(data: unknown, now: number) {
  const value = object(data);
  if (!value || Object.keys(value).length !== 1 || !Array.isArray(value.receipts)
    || value.receipts.length < 1 || value.receipts.length > gatewayLimits.batch) return null;
  const receipts: GatewayReceipt[] = [];
  for (const row of value.receipts) {
    const receipt = parseReceipt(row, now);
    if (!receipt) return null;
    receipts.push(receipt);
  }
  return receipts;
}

export function validateGatewayRange({ from, through, limit = gatewayLimits.defaultLimit }: { from: string; through: string; limit?: number }) {
  const valid = (day: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
    const value = Date.parse(day);
    return Number.isFinite(value) && value >= MIN_EVENT_TIME && dayFromTimestamp(value) === day;
  };
  if (!valid(from) || !valid(through) || from > through
    || Date.parse(through) - Date.parse(from) >= gatewayLimits.days * DAY_MS) throw new ConvexError("INVALID_GATEWAY_RANGE");
  if (!Number.isInteger(limit) || limit < 1 || limit > gatewayLimits.maximumLimit) throw new ConvexError("INVALID_GATEWAY_LIMIT");
  return { from, through, limit };
}
