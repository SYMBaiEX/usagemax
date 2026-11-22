import { ConvexError, v } from "convex/values";

import { gatewaySpan, gatewayTrace, type GatewayTrace } from "./gatewayTraceContract";
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
  trace: v.optional(gatewayTrace),
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

const spanIdPattern = /^(?!0{16}$)[a-f0-9]{16}$/;
const spanKinds = gatewaySpan.fields.kind.members.map((item) => item.value);
const spanOutcomes = gatewaySpan.fields.outcome.members.map((item) => item.value);

function parseTrace(value: unknown, now: number): GatewayTrace | null {
  const raw = object(value);
  if (!raw || Object.keys(raw).some((key) => !Object.hasOwn(gatewayTrace.fields, key))
    || (raw.billingStatus !== "final" && raw.billingStatus !== "pending")
    || !Array.isArray(raw.spans) || raw.spans.length < 1 || raw.spans.length > 12) return null;
  const spans: GatewayTrace["spans"] = [];
  const byId = new Map<string, GatewayTrace["spans"][number]>();
  for (const item of raw.spans) {
    const span = object(item);
    if (!span || Object.keys(span).some((key) => !Object.hasOwn(gatewaySpan.fields, key))) return null;
    const { spanId, parentSpanId, kind, startedAt, endedAt, status, httpStatus, provider, model, outcome } = span;
    if (typeof spanId !== "string" || !spanIdPattern.test(spanId) || byId.has(spanId)
      || !isTimestamp(startedAt, now) || !isTimestamp(endedAt, now) || startedAt > endedAt
      || (status !== "ok" && status !== "error")
      || typeof kind !== "string" || !spanKinds.some((entry) => entry === kind)) return null;
    const parent = typeof parentSpanId === "string" ? byId.get(parentSpanId) : undefined;
    if (spans.length === 0
      ? kind !== "request" || parentSpanId !== undefined
      : kind === "request" || !parent || startedAt < parent.startedAt || endedAt > parent.endedAt) return null;
    if (kind === "provider" ? !isSlug(provider) || (model !== undefined && !isSlug(model))
      : provider !== undefined || model !== undefined) return null;
    if (httpStatus !== undefined && (kind !== "provider" || !isCounter(httpStatus) || httpStatus < 100 || httpStatus > 599)) return null;
    if (outcome !== undefined && (kind !== "provider" || !spanOutcomes.some((entry) => entry === outcome))) return null;
    const parsed = {
      spanId, kind: kind as GatewayTrace["spans"][number]["kind"], startedAt, endedAt, status,
      ...(parent ? { parentSpanId: parent.spanId } : {}),
      ...(httpStatus === undefined ? {} : { httpStatus }),
      ...(typeof provider === "string" ? { provider } : {}),
      ...(typeof model === "string" ? { model } : {}),
      ...(outcome === undefined ? {} : { outcome: outcome as GatewayTrace["spans"][number]["outcome"] }),
    } satisfies GatewayTrace["spans"][number];
    spans.push(parsed);
    byId.set(spanId, parsed);
  }
  return { billingStatus: raw.billingStatus, spans };
}

function parseReceipt(value: unknown, now: number): GatewayReceipt | null {
  const raw = object(value);
  if (!raw || Object.keys(raw).some((key) => !Object.hasOwn(gatewayReceipt.fields, key))) return null;
  const rawUsage = object(raw.usage);
  if (!rawUsage || Object.keys(rawUsage).some((key) => !Object.hasOwn(usage.fields, key))) return null;
  const { schemaVersion, requestId, revision, model, provider, status, settledAt, startedAt, firstTokenAt, stream,
    resolvedModel, traceId, trace: rawTrace, currency, customerChargeNanos, providerCostNanos, providerCostBasis } = raw;
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

  const trace = rawTrace === undefined ? undefined : parseTrace(rawTrace, now);
  if (trace === null || (trace && (typeof traceId !== "string" || !/^(?!0{32}$)[a-f0-9]{32}$/.test(traceId)
    || (trace.billingStatus === "pending" && (status !== "error" || customerChargeNanos !== null))))) return null;

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
    ...(trace === undefined ? {} : { trace }),
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
