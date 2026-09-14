import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { MIN_EVENT_TIME, clampNonNegative, cleanText, jsonResponse, sha256 } from "./lib";
import type { telemetryEventValidator } from "./telemetry";

type NormalizedEvent = typeof telemetryEventValidator.type;
type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function optionalText(value: unknown, max = 160) {
  return typeof value === "string" && value.trim() ? cleanText(value, "", max) : undefined;
}

function timestamp(value: unknown, now: number) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isFinite(parsed) || parsed < MIN_EVENT_TIME || parsed > now + 5 * 60_000) throw new Error("INVALID_TIMESTAMP");
  return Math.round(parsed);
}

function nativeEvent(value: unknown, now: number): Omit<NormalizedEvent, "eventHash"> {
  const event = object(value);
  if (!event) throw new Error("INVALID_EVENT");
  const eventKey = cleanText(event.eventKey, "", 180);
  const model = cleanText(event.model, "", 120);
  if (!eventKey || !model) throw new Error("EVENT_KEY_AND_MODEL_REQUIRED");
  const inputTokens = clampNonNegative(event.inputTokens, 1_000_000_000_000);
  const outputTokens = clampNonNegative(event.outputTokens, 1_000_000_000_000);
  const cacheReadTokens = clampNonNegative(event.cacheReadTokens, 1_000_000_000_000);
  const cacheWriteTokens = clampNonNegative(event.cacheWriteTokens, 1_000_000_000_000);
  const reasoningTokens = clampNonNegative(event.reasoningTokens, 1_000_000_000_000);
  const reportedTotal = clampNonNegative(event.totalTokens, 1_000_000_000_000);
  const costMicros = clampNonNegative(event.costMicros, 1_000_000_000_000_000);
  const eventType = ["model_request", "tool_call", "agent_state", "outcome"].includes(String(event.eventType))
    ? (event.eventType as NormalizedEvent["eventType"])
    : "model_request";
  const status = ["ok", "error", "cancelled"].includes(String(event.status))
    ? (event.status as NormalizedEvent["status"])
    : "ok";
  const completeness = ["reported", "estimated", "unknown"].includes(String(event.completeness))
    ? (event.completeness as NormalizedEvent["completeness"])
    : "unknown";
  const costBasis = ["reported", "estimated", "unknown"].includes(String(event.costBasis))
    ? (event.costBasis as NormalizedEvent["costBasis"])
    : typeof event.costMicros === "number" && Number.isFinite(event.costMicros)
      ? "reported"
      : "unknown";
  const accountingMode = event.accountingMode === "observability" ? "observability" : "usage";
  return {
    eventKey,
    logicalRequestId: optionalText(event.logicalRequestId),
    sessionId: optionalText(event.sessionId),
    agentExternalId: optionalText(event.agentId ?? event.agentExternalId),
    parentAgentExternalId: optionalText(event.parentAgentId ?? event.parentAgentExternalId),
    agentName: optionalText(event.agentName, 80),
    eventType,
    source: cleanText(event.source, "usagemax-sdk", 60),
    provider: cleanText(event.provider, "unknown", 60),
    requestedModel: optionalText(event.requestedModel, 120),
    model,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    reasoningTokens,
    totalTokens: reportedTotal || inputTokens + outputTokens,
    costMicros,
    costBasis,
    accountingMode,
    latencyMs: event.latencyMs === undefined ? undefined : clampNonNegative(event.latencyMs, 86_400_000),
    timeToFirstTokenMs: event.timeToFirstTokenMs === undefined ? undefined : clampNonNegative(event.timeToFirstTokenMs, 86_400_000),
    status,
    state: optionalText(event.state, 40),
    task: optionalText(event.task, 180),
    traceId: optionalText(event.traceId, 64),
    spanId: optionalText(event.spanId, 32),
    occurredAt: timestamp(event.occurredAt, now),
    schemaVersion: 1,
    completeness,
  };
}

function otelValue(value: unknown): unknown {
  const wrapper = object(value);
  if (!wrapper) return undefined;
  for (const key of ["stringValue", "intValue", "doubleValue", "boolValue"]) {
    if (wrapper[key] !== undefined) return wrapper[key];
  }
  return undefined;
}

function attributes(value: unknown) {
  const result: JsonObject = {};
  for (const item of array(value)) {
    const attribute = object(item);
    if (typeof attribute?.key === "string") result[attribute.key] = otelValue(attribute.value);
  }
  return result;
}

function attributeNumber(attrs: JsonObject, ...keys: string[]) {
  for (const key of keys) {
    const raw = attrs[key];
    const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function optionalAttributeNumber(attrs: JsonObject, ...keys: string[]) {
  for (const key of keys) {
    if (!(key in attrs)) continue;
    const raw = attrs[key];
    const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
    if (Number.isFinite(value)) return value;
  }
  return undefined;
}

function nanosToMillis(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed / 1_000_000 : NaN;
}

function otelEvents(body: JsonObject, now: number): Omit<NormalizedEvent, "eventHash">[] {
  const normalized: Omit<NormalizedEvent, "eventHash">[] = [];
  for (const resourceSpanValue of array(body.resourceSpans)) {
    const resourceSpan = object(resourceSpanValue);
    const resource = object(resourceSpan?.resource);
    const resourceAttributes = attributes(resource?.attributes);
    const serviceName = cleanText(resourceAttributes["service.name"], "agent", 80);
    for (const scopeSpanValue of array(resourceSpan?.scopeSpans)) {
      const scopeSpan = object(scopeSpanValue);
      for (const spanValue of array(scopeSpan?.spans)) {
        const span = object(spanValue);
        if (!span) continue;
        const attrs = { ...resourceAttributes, ...attributes(span.attributes) };
        const traceId = optionalText(span.traceId, 64);
        const spanId = optionalText(span.spanId, 32);
        if (!traceId || !spanId) continue;
        const start = nanosToMillis(span.startTimeUnixNano);
        const end = nanosToMillis(span.endTimeUnixNano);
        const inputTokens = clampNonNegative(attributeNumber(attrs, "gen_ai.usage.input_tokens", "gen_ai.usage.prompt_tokens"), 1_000_000_000_000);
        const outputTokens = clampNonNegative(attributeNumber(attrs, "gen_ai.usage.output_tokens", "gen_ai.usage.completion_tokens"), 1_000_000_000_000);
        const cacheReadTokens = clampNonNegative(attributeNumber(
          attrs,
          "gen_ai.usage.cache_read.input_tokens",
          "gen_ai.usage.cache_read_tokens",
        ), 1_000_000_000_000);
        const cacheWriteTokens = clampNonNegative(attributeNumber(
          attrs,
          "gen_ai.usage.cache_creation.input_tokens",
          "gen_ai.usage.cache_write_tokens",
        ), 1_000_000_000_000);
        const reasoningTokens = clampNonNegative(attributeNumber(
          attrs,
          "gen_ai.usage.reasoning.output_tokens",
          "gen_ai.usage.reasoning_tokens",
        ), 1_000_000_000_000);
        const name = cleanText(span.name, "model.request", 120);
        const state = optionalText(attrs["gen_ai.agent.state"], 40);
        const statusObject = object(span.status);
        const isError = statusObject?.code === 2 || Boolean(attrs["error.type"]);
        const costMicrosAttribute = optionalAttributeNumber(attrs, "gen_ai.usage.cost_micros");
        const costUsdAttribute = optionalAttributeNumber(attrs, "gen_ai.usage.cost");
        const reportedCost = costMicrosAttribute ?? (costUsdAttribute === undefined ? 0 : costUsdAttribute * 1_000_000);
        const hasReportedCost = costMicrosAttribute !== undefined || costUsdAttribute !== undefined;
        normalized.push({
          eventKey: `${traceId}:${spanId}`,
          logicalRequestId: optionalText(attrs["gen_ai.request.id"] ?? attrs["logical_request_id"]),
          sessionId: optionalText(attrs["session.id"] ?? attrs["gen_ai.conversation.id"]),
          agentExternalId: optionalText(attrs["gen_ai.agent.id"] ?? attrs["agent.id"]) ?? serviceName,
          parentAgentExternalId: optionalText(attrs["gen_ai.agent.parent_id"] ?? attrs["agent.parent_id"]),
          agentName: optionalText(attrs["gen_ai.agent.name"], 80) ?? serviceName,
          eventType: name.toLowerCase().includes("tool") ? "tool_call" : state ? "agent_state" : "model_request",
          source: cleanText(attrs["telemetry.sdk.name"], "otel", 60),
          provider: cleanText(attrs["gen_ai.provider.name"] ?? attrs["gen_ai.system"], "unknown", 60),
          requestedModel: optionalText(attrs["gen_ai.request.model"], 120),
          model: cleanText(attrs["gen_ai.response.model"] ?? attrs["gen_ai.request.model"], "unknown", 120),
          inputTokens,
          outputTokens,
          cacheReadTokens,
          cacheWriteTokens,
          reasoningTokens,
          totalTokens: inputTokens + outputTokens,
          costMicros: clampNonNegative(reportedCost, 1_000_000_000_000_000),
          costBasis: hasReportedCost ? "reported" : "unknown",
          accountingMode: "usage",
          latencyMs: Number.isFinite(start) && Number.isFinite(end) ? clampNonNegative(end - start, 86_400_000) : undefined,
          timeToFirstTokenMs: attributeNumber(attrs, "gen_ai.server.time_to_first_token") || undefined,
          status: isError ? "error" : "ok",
          state,
          task: optionalText(attrs["gen_ai.agent.task"], 180),
          traceId,
          spanId,
          occurredAt: timestamp(Number.isFinite(start) ? start : now, now),
          schemaVersion: 1,
          completeness: "reported",
        });
      }
    }
  }
  return normalized;
}

async function ingest(ctx: Parameters<Parameters<typeof httpAction>[0]>[0], request: Request, format: "native" | "otlp") {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return jsonResponse({ error: "content_type_must_be_application_json" }, 415);
  }
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (token.length < 32) return jsonResponse({ error: "unauthorized" }, 401);
  const batchId = cleanText(request.headers.get("idempotency-key"), "", 180);
  if (!batchId) return jsonResponse({ error: "idempotency_key_required" }, 400);
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > 1_000_000) return jsonResponse({ error: "payload_too_large" }, 413);
  const rawBody = await request.text();
  if (rawBody.length > 1_000_000) return jsonResponse({ error: "payload_too_large" }, 413);
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }
  const body = object(parsed);
  if (!body) return jsonResponse({ error: "body_must_be_an_object" }, 400);
  const now = Date.now();
  let sourceEvents: Omit<NormalizedEvent, "eventHash">[];
  try {
    sourceEvents = format === "native" ? array(body.events).map((event) => nativeEvent(event, now)) : otelEvents(body, now);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message.toLowerCase() : "invalid_event" }, 400);
  }
  if (sourceEvents.length < 1 || sourceEvents.length > 100) return jsonResponse({ error: "events_must_contain_1_to_100_items" }, 400);
  const seen = new Set<string>();
  sourceEvents = sourceEvents.filter((event) => !seen.has(event.eventKey) && Boolean(seen.add(event.eventKey)));
  const events = await Promise.all(sourceEvents.map(async (event) => ({ ...event, eventHash: await sha256(JSON.stringify(event)) })));
  try {
    const result = await ctx.runMutation(internal.telemetry.commitBatch, {
      keyHash: await sha256(token),
      batchId,
      payloadHash: await sha256(rawBody),
      receivedAt: now,
      events,
    });
    return jsonResponse({ ok: true, ...result }, result.replay ? 200 : 202);
  } catch (error) {
    const message = String(error);
    if (message.includes("INVALID_COLLECTOR")) return jsonResponse({ error: "unauthorized" }, 401);
    if (message.includes("RATE_LIMITED")) return jsonResponse({ error: "rate_limited" }, 429, { "retry-after": "60" });
    if (message.includes("IDEMPOTENCY_CONFLICT")) return jsonResponse({ error: "idempotency_conflict" }, 409);
    return jsonResponse({ error: "ingest_failed" }, 500);
  }
}

const http = httpRouter();
const cors = httpAction(async () => new Response(null, {
  status: 204,
  headers: {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type, idempotency-key",
    "access-control-allow-methods": "POST, OPTIONS",
  },
}));

http.route({ path: "/health", method: "GET", handler: httpAction(async () => jsonResponse({ ok: true, service: "usagemax-ingest", storage: "convex" })) });
http.route({ path: "/v1/telemetry/llm", method: "POST", handler: httpAction((ctx, request) => ingest(ctx, request, "native")) });
http.route({ path: "/v1/telemetry/llm", method: "OPTIONS", handler: cors });
http.route({ path: "/v1/traces", method: "POST", handler: httpAction((ctx, request) => ingest(ctx, request, "otlp")) });
http.route({ path: "/v1/traces", method: "OPTIONS", handler: cors });

export default http;
