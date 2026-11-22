import { v } from "convex/values";

export const gatewaySpan = v.object({
  spanId: v.string(),
  parentSpanId: v.optional(v.string()),
  kind: v.union(
    v.literal("request"),
    v.literal("reservation"),
    v.literal("provider"),
    v.literal("verification"),
    v.literal("settlement"),
    v.literal("recovery"),
  ),
  startedAt: v.number(),
  endedAt: v.number(),
  status: v.union(v.literal("ok"), v.literal("error")),
  httpStatus: v.optional(v.number()),
  provider: v.optional(v.string()),
  model: v.optional(v.string()),
  outcome: v.optional(v.union(
    v.literal("success"),
    v.literal("http_error"),
    v.literal("transport_error"),
    v.literal("invalid_response"),
    v.literal("verification_failed"),
    v.literal("incomplete_stream"),
  )),
});

export const gatewayTrace = v.object({
  billingStatus: v.union(v.literal("final"), v.literal("pending")),
  spans: v.array(gatewaySpan),
});

export type GatewayTrace = typeof gatewayTrace.type;
