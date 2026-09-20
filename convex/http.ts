import { httpRouter } from "convex/server";
import { WorkOS } from "@workos-inc/node";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { MIN_EVENT_TIME, clampNonNegative, cleanText, jsonResponse, sha256 } from "./lib";
import { isAutomaticDeviceName } from "./device_name";
import type { telemetryEventValidator } from "./telemetry";
import { verifyStripeSignature } from "./billing";

type NormalizedEvent = typeof telemetryEventValidator.type;
type JsonObject = Record<string, unknown>;
const RECOMMENDED_CLI_VERSION = "0.3.7";
const PUBLIC_SNAPSHOT_STATUS_ORIGIN = "https://usagemax.com";

function snapshotStatusUrl(runId: string) {
  return `${PUBLIC_SNAPSHOT_STATUS_ORIGIN}/api/v2/usage/snapshots/${encodeURIComponent(runId)}`;
}

function snapshotResponse(runId: string, body: Record<string, unknown>, status: number) {
  const statusUrl = snapshotStatusUrl(runId);
  return jsonResponse({ runId, statusUrl, ...body }, status, status === 202 ? { location: statusUrl } : undefined);
}

function newCollectorToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `umx_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function optionalText(value: unknown, max = 160) {
  return typeof value === "string" && value.trim() ? cleanText(value, "", max) : undefined;
}

function billingTier(value: unknown): "team" | "enterprise" | undefined {
  return value === "team" || value === "enterprise" ? value : undefined;
}

function billingStatus(value: unknown):
  | "inactive"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "unpaid"
  | "paused"
  | undefined {
  return value === "inactive" || value === "trialing" || value === "active"
    || value === "past_due" || value === "canceled" || value === "incomplete"
    || value === "unpaid" || value === "paused" ? value : undefined;
}

function deviceId(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)) {
    throw new Error("INVALID_DEVICE_ID");
  }
  return value.toLowerCase();
}

function timestamp(value: unknown, now: number) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isFinite(parsed) || parsed < MIN_EVENT_TIME || parsed > now + 5 * 60_000) throw new Error("INVALID_TIMESTAMP");
  return Math.round(parsed);
}

function safeCounter(value: unknown, maximum = 1_000_000_000_000_000) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new Error("INVALID_SNAPSHOT_COUNTER");
  }
  return value;
}

function snapshotCounters(value: unknown) {
  const counters = object(value);
  if (!counters) throw new Error("INVALID_SNAPSHOT_COUNTERS");
  const normalized = {
    inputTokens: safeCounter(counters.inputTokens),
    outputTokens: safeCounter(counters.outputTokens),
    cacheReadTokens: safeCounter(counters.cacheReadTokens),
    cacheWriteTokens: safeCounter(counters.cacheWriteTokens),
    reasoningTokens: safeCounter(counters.reasoningTokens),
    unclassifiedTokens: safeCounter(counters.unclassifiedTokens),
    totalTokens: safeCounter(counters.totalTokens),
    costMicros: safeCounter(counters.costMicros),
    requests: safeCounter(counters.requests),
    errors: safeCounter(counters.errors),
  };
  const classified = normalized.inputTokens + normalized.outputTokens + normalized.cacheReadTokens
    + normalized.cacheWriteTokens + normalized.reasoningTokens + normalized.unclassifiedTokens;
  if (classified !== normalized.totalTokens) throw new Error("INVALID_SNAPSHOT_TOTAL");
  return normalized;
}

async function authorizationContext(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!/^umx_[a-f0-9]{64}$/.test(token)) throw new Error("UNAUTHORIZED");
  const id = deviceId(request.headers.get("x-usagemax-device-id"));
  return { keyHash: await sha256(token), installationIdHash: id ? await sha256(id) : undefined };
}

async function requiredAuthorizationContext(request: Request) {
  const auth = await authorizationContext(request);
  if (!auth.installationIdHash) throw new Error("INVALID_DEVICE_ID");
  return auth as { keyHash: string; installationIdHash: string };
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
  const displayOnly = event.accountingMode === "observability";
  const requestedEventType = ["model_request", "tool_call", "agent_state", "outcome"].includes(String(event.eventType))
    ? (event.eventType as NormalizedEvent["eventType"])
    : "model_request";
  const eventType: NormalizedEvent["eventType"] = displayOnly ? "agent_state" : requestedEventType;
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
    inputTokens: displayOnly ? 0 : inputTokens,
    outputTokens: displayOnly ? 0 : outputTokens,
    cacheReadTokens: displayOnly ? 0 : cacheReadTokens,
    cacheWriteTokens: displayOnly ? 0 : cacheWriteTokens,
    reasoningTokens: displayOnly ? 0 : reasoningTokens,
    totalTokens: displayOnly ? 0 : reportedTotal || inputTokens + outputTokens,
    costMicros: displayOnly ? 0 : costMicros,
    costBasis,
    pricingSource: optionalText(event.pricingSource, 120),
    pricingVersion: optionalText(event.pricingVersion, 120),
    serviceTier: optionalText(event.serviceTier, 40),
    region: optionalText(event.region, 60),
    currency: optionalText(event.currency, 3)?.toUpperCase(),
    projectId: optionalText(event.projectId, 80),
    costCenter: optionalText(event.costCenter, 80),
    latencyMs: event.latencyMs === undefined ? undefined : clampNonNegative(event.latencyMs, 86_400_000),
    timeToFirstTokenMs: event.timeToFirstTokenMs === undefined ? undefined : clampNonNegative(event.timeToFirstTokenMs, 86_400_000),
    status,
    state: optionalText(event.state, 40),
    task: optionalText(event.task, 180),
    traceId: optionalText(event.traceId, 64),
    spanId: optionalText(event.spanId, 32),
    occurredAt: timestamp(event.occurredAt, now),
    schemaVersion: event.schemaVersion === 1 || (event.state === "synced" && event.pricingSource === "ccusage / LiteLLM") ? 1 : 2,
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
          pricingSource: optionalText(attrs["gen_ai.usage.cost.source"] ?? attrs["usagemax.pricing.source"], 120),
          pricingVersion: optionalText(attrs["gen_ai.usage.cost.version"] ?? attrs["usagemax.pricing.version"], 120),
          serviceTier: optionalText(attrs["gen_ai.request.service_tier"] ?? attrs["usagemax.service_tier"], 40),
          region: optionalText(attrs["cloud.region"] ?? attrs["usagemax.region"], 60),
          currency: optionalText(attrs["gen_ai.usage.cost.currency"] ?? attrs["usagemax.currency"], 3)?.toUpperCase(),
          projectId: optionalText(attrs["project.id"] ?? attrs["usagemax.project_id"], 80),
          costCenter: optionalText(attrs["usagemax.cost_center"], 80),
          latencyMs: Number.isFinite(start) && Number.isFinite(end) ? clampNonNegative(end - start, 86_400_000) : undefined,
          timeToFirstTokenMs: attributeNumber(attrs, "gen_ai.server.time_to_first_token") || undefined,
          status: isError ? "error" : "ok",
          state,
          task: optionalText(attrs["gen_ai.agent.task"], 180),
          traceId,
          spanId,
          occurredAt: timestamp(Number.isFinite(start) ? start : now, now),
          schemaVersion: 2,
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
  let auth: { keyHash: string; installationIdHash: string };
  try {
    auth = await requiredAuthorizationContext(request);
  } catch (error) {
    const message = String(error);
    return jsonResponse({ error: message.includes("INVALID_DEVICE_ID") ? "invalid_device_id" : "unauthorized" }, message.includes("INVALID_DEVICE_ID") ? 400 : 401);
  }
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
      keyHash: auth.keyHash,
      batchId,
      payloadHash: await sha256(rawBody),
      receivedAt: now,
      installationIdHash: auth.installationIdHash,
      events,
    });
    return jsonResponse({ ok: true, ...result }, result.replay ? 200 : 202);
  } catch (error) {
    const message = String(error);
    if (message.includes("INVALID_COLLECTOR_SCOPE")) return jsonResponse({ error: "forbidden" }, 403);
    if (message.includes("INVALID_COLLECTOR")) return jsonResponse({ error: "unauthorized" }, 401);
    if (message.includes("DEVICE_ID_MISMATCH")) return jsonResponse({ error: "device_identity_mismatch" }, 409);
    if (message.includes("RATE_LIMITED")) return jsonResponse({ error: "rate_limited" }, 429, { "retry-after": "60" });
    if (message.includes("IDEMPOTENCY_CONFLICT")) return jsonResponse({ error: "idempotency_conflict" }, 409);
    return jsonResponse({ error: "ingest_failed" }, 500);
  }
}

const linkDevice = httpAction(async (ctx, request) => {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return jsonResponse({ error: "content_type_must_be_application_json" }, 415);
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > 16_384) return jsonResponse({ error: "payload_too_large" }, 413);
  const rawBody = await request.text();
  if (rawBody.length > 16_384) return jsonResponse({ error: "payload_too_large" }, 413);
  let body: JsonObject | null = null;
  try {
    body = object(JSON.parse(rawBody));
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }
  const code = cleanText(body?.code, "", 64).toUpperCase();
  if (!/^UMX-[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){3}$/.test(code)) {
    return jsonResponse({ error: "invalid_or_expired_link_code" }, 400);
  }
  try {
    const codeHash = await sha256(code);
    await ctx.runMutation(internal.rateLimits.consumeDeviceLinkAttempt, { codeHash });
    const token = newCollectorToken();
    const id = deviceId(body?.deviceId);
    const priorAuthorization = request.headers.get("authorization") ?? "";
    const priorToken = priorAuthorization.startsWith("Bearer ") ? priorAuthorization.slice(7).trim() : "";
    const result = await ctx.runMutation(internal.account.redeemDeviceLink, {
      codeHash,
      keyHash: await sha256(token),
      keyPrefix: token.slice(0, 12),
      name: typeof body?.name === "string" && body.name.trim() ? cleanText(body.name, "My computer", 80) : undefined,
      nameIsExplicit: body?.nameExplicit === true || (typeof body?.name === "string" && body.name.trim() ? !isAutomaticDeviceName(body.name, typeof body.platform === "string" ? body.platform : undefined) : undefined),
      platform: optionalText(body?.platform, 24),
      cliVersion: optionalText(body?.cliVersion, 24),
      installationIdHash: id ? await sha256(id) : undefined,
      priorKeyHash: /^umx_[a-f0-9]{64}$/.test(priorToken) ? await sha256(priorToken) : undefined,
      now: Date.now(),
    });
    return jsonResponse({
      ok: true,
      token,
      ingestUrl: new URL("/v1/telemetry/llm", request.url).toString(),
      snapshotUrl: new URL("/v2/usage/snapshots", request.url).toString(),
      statusUrl: new URL("/v1/devices/status", request.url).toString(),
      revokeUrl: new URL("/v1/devices/revoke", request.url).toString(),
      recommendedCliVersion: RECOMMENDED_CLI_VERSION,
      profileHandle: result.handle,
      deviceName: result.deviceName,
      profileUrl: `https://usagemax.com/${encodeURIComponent(result.handle)}`,
    });
  } catch (error) {
    const message = String(error);
    if (message.includes("RATE_LIMITED")) return jsonResponse({ error: "rate_limited" }, 429, { "retry-after": "60" });
    if (message.includes("COLLECTOR_LIMIT_REACHED")) return jsonResponse({ error: "collector_limit_reached" }, 409);
    if (message.includes("INVALID_LINK_CODE")) return jsonResponse({ error: "invalid_or_expired_link_code" }, 400);
    if (message.includes("INVALID_DEVICE_ID")) return jsonResponse({ error: "invalid_device_id" }, 400);
    return jsonResponse({ error: "link_failed" }, 500);
  }
});

const snapshots = httpAction(async (ctx, request) => {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return jsonResponse({ error: "content_type_must_be_application_json" }, 415);
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > 2_000_000) return jsonResponse({ error: "payload_too_large" }, 413);
  const rawBody = await request.text();
  if (rawBody.length > 2_000_000) return jsonResponse({ error: "payload_too_large" }, 413);
  let body: JsonObject | null;
  let auth: Awaited<ReturnType<typeof authorizationContext>>;
  try {
    body = object(JSON.parse(rawBody));
    if (!body) throw new Error("INVALID_BODY");
    auth = await requiredAuthorizationContext(request);
  } catch (error) {
    const message = String(error);
    const unauthorized = message.includes("UNAUTHORIZED");
    return jsonResponse({ error: unauthorized ? "unauthorized" : message.includes("INVALID_DEVICE_ID") ? "invalid_device_id" : "invalid_request" }, unauthorized ? 401 : 400);
  }
  const operation = body.operation;
  const runId = cleanText(body.runId, "", 80);
  const now = Date.now();
  if (!runId) return jsonResponse({ error: "run_id_required" }, 400);
  try {
    if (operation === "begin") {
      const result = await ctx.runMutation(internal.snapshots.beginRun, {
        ...auth,
        runId,
        mode: ["incremental", "full", "archives"].includes(String(body.mode)) ? body.mode as "incremental" | "full" | "archives" : "incremental",
        requestedBaselineMode: body.baselineMode === "adopt-current" ? "adopt-current" : "apply",
        sourceCount: safeCounter(body.sourceCount, 10_000),
        partitionCount: safeCounter(body.partitionCount, 100_000),
        inventoryComplete: body.inventoryComplete === true,
        inventoryErrors: safeCounter(body.inventoryErrors, 100_000),
        inventoryTruncated: body.inventoryTruncated === true,
        coverageStartDay: optionalText(body.coverageStartDay, 10),
        coverageEndDay: optionalText(body.coverageEndDay, 10),
        now,
      });
      return snapshotResponse(runId, { ok: true, recommendedCliVersion: RECOMMENDED_CLI_VERSION, ...result }, result.replay ? 200 : 202);
    }
    if (operation === "sessions") {
      const rawSessions = array(body.sessions);
      if (rawSessions.length > 100) return jsonResponse({ error: "sessions_must_contain_0_to_100_items" }, 400);
      const sessions = rawSessions.map((value) => {
        const session = object(value);
        const source = cleanText(session?.source, "", 60);
        const sessionKey = cleanText(session?.sessionKey, "", 64);
        if (!source || !/^[a-f0-9]{64}$/.test(sessionKey)) throw new Error("INVALID_SESSION");
        return {
          source,
          sessionKey,
          firstActivityAt: session?.firstActivityAt === undefined ? undefined : timestamp(session.firstActivityAt, now),
          lastActivityAt: session?.lastActivityAt === undefined ? undefined : timestamp(session.lastActivityAt, now),
        };
      });
      const result = await ctx.runMutation(internal.snapshots.commitSessions, { ...auth, runId, sessions, now });
      return snapshotResponse(runId, { ok: true, recommendedCliVersion: RECOMMENDED_CLI_VERSION, ...result }, 202);
    }
    if (operation === "partitions") {
      const rawPartitions = array(body.partitions);
      if (rawPartitions.length < 1 || rawPartitions.length > 10) return jsonResponse({ error: "partitions_must_contain_1_to_10_items" }, 400);
      let changedRows = 0;
      let correctionRows = 0;
      let replays = 0;
      for (const value of rawPartitions) {
        const partition = object(value);
        if (!partition) throw new Error("INVALID_PARTITION");
        const source = cleanText(partition.source, "", 60);
        const day = cleanText(partition.day, "", 10);
        const partitionId = cleanText(partition.partitionId, "", 180);
        const pricingVersion = optionalText(partition.pricingVersion, 120);
        const revision = safeCounter(partition.revision, Number.MAX_SAFE_INTEGER);
        const rawRows = array(partition.rows);
        if (!source || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !partitionId || rawRows.length > 100) throw new Error("INVALID_PARTITION");
        const rows = rawRows.map((rowValue) => {
          const row = object(rowValue);
          const provider = cleanText(row?.provider, "", 60);
          const model = cleanText(row?.model, "", 120);
          const contentHash = cleanText(row?.contentHash, "", 64);
          const costBasis = ["reported", "estimated", "api-equivalent", "unknown"].includes(String(row?.costBasis))
            ? row?.costBasis as "reported" | "estimated" | "api-equivalent" | "unknown"
            : "unknown";
          if (!provider || !model || !/^[a-f0-9]{64}$/.test(contentHash)) throw new Error("INVALID_SNAPSHOT_ROW");
          return {
            provider,
            model,
            previous: snapshotCounters(row?.previous),
            current: snapshotCounters(row?.current),
            costBasis,
            contentHash,
            lastUsedAt: timestamp(row?.lastUsedAt, now),
          };
        });
        const complete = partition.complete === true;
        const chunked = partition.chunkIndex !== undefined || partition.chunkCount !== undefined;
        const chunkIndex = chunked ? partition.chunkIndex : undefined;
        const chunkCount = chunked ? partition.chunkCount : undefined;
        if (chunked && (typeof chunkIndex !== "number" || typeof chunkCount !== "number" || !Number.isSafeInteger(chunkIndex) || !Number.isSafeInteger(chunkCount) || chunkIndex < 0 || chunkCount < 1 || chunkCount > 10000 || chunkIndex >= chunkCount)) throw new Error("INVALID_SNAPSHOT_CHUNK");
        const calculatedHash = await sha256(JSON.stringify(chunked ? { source, day, complete, pricingVersion, chunkIndex, chunkCount, rows } : { source, day, complete, pricingVersion, rows }));
        if (calculatedHash !== partition.payloadHash) throw new Error("PAYLOAD_HASH_MISMATCH");
        const result = await ctx.runMutation(internal.snapshots.commitPartition, {
          ...auth,
          runId,
          partitionId,
          payloadHash: calculatedHash,
          revision,
          source,
          day,
          complete,
          pricingVersion,
          ...(chunked ? { chunkIndex: chunkIndex as number, chunkCount: chunkCount as number } : {}),
          rows,
          now: Date.now(),
        });
        changedRows += result.changedRows;
        correctionRows += result.correctionRows;
        replays += result.replay ? 1 : 0;
      }
      return snapshotResponse(runId, { ok: true, recommendedCliVersion: RECOMMENDED_CLI_VERSION, changedRows, correctionRows, replays }, 202);
    }
    if (operation === "complete") {
      const result = await ctx.runMutation(internal.snapshots.completeRun, { ...auth, runId, now });
      return jsonResponse({ ok: true, recommendedCliVersion: RECOMMENDED_CLI_VERSION, ...result }, 200);
    }
    if (operation === "fail") {
      const result = await ctx.runMutation(internal.snapshots.failRun, {
        keyHash: auth.keyHash,
        installationIdHash: auth.installationIdHash,
        runId,
        failureCode: cleanText(body.failureCode, "sync_failed", 80),
        now,
      });
      return jsonResponse({ ok: true, recommendedCliVersion: RECOMMENDED_CLI_VERSION, ...result }, 200);
    }
    return jsonResponse({ error: "unknown_operation" }, 400);
  } catch (error) {
    const message = String(error);
    if (message.includes("RATE_LIMITED")) return jsonResponse({ error: "rate_limited" }, 429, { "retry-after": "60" });
    if (message.includes("INVALID_COLLECTOR")) return jsonResponse({ error: "unauthorized" }, 401);
    if (message.includes("DEVICE_ID_MISMATCH")) return jsonResponse({ error: "device_identity_mismatch" }, 409);
    if (message.includes("IDEMPOTENCY_CONFLICT") || message.includes("STALE_SNAPSHOT_REVISION")) return jsonResponse({ error: "snapshot_conflict" }, 409);
    if (message.includes("SNAPSHOT_RUN_INCOMPLETE")) return jsonResponse({ error: "snapshot_run_incomplete" }, 409);
    if (message.includes("SNAPSHOT_RUN_EXPIRED")) return jsonResponse({ error: "snapshot_run_expired" }, 410);
    if (message.includes("PROJECTION_UNDERFLOW")) return jsonResponse({ error: "reconciliation_required" }, 409);
    if (message.includes("INVALID_") || message.includes("PAYLOAD_") || message.includes("DUPLICATE_")) return jsonResponse({ error: "invalid_snapshot" }, 400);
    return jsonResponse({ error: "snapshot_failed" }, 500);
  }
});

const snapshotStatus = httpAction(async (ctx, request) => {
  const marker = "/v2/usage/snapshots/";
  const pathname = new URL(request.url).pathname;
  const encodedRunId = pathname.startsWith(marker) ? pathname.slice(marker.length) : "";
  let runId = "";
  try {
    runId = decodeURIComponent(encodedRunId);
  } catch {
    return jsonResponse({ error: "invalid_snapshot_run_id" }, 400);
  }
  if (!/^[A-Za-z0-9._:-]{1,80}$/.test(runId)) return jsonResponse({ error: "invalid_snapshot_run_id" }, 400);

  let auth: Awaited<ReturnType<typeof authorizationContext>>;
  try {
    auth = await authorizationContext(request);
  } catch (error) {
    if (String(error).includes("INVALID_DEVICE_ID")) return jsonResponse({ error: "invalid_device_id" }, 400);
    return jsonResponse({ error: "unauthorized" }, 401, { "www-authenticate": 'Bearer resource_metadata="https://usagemax.com/.well-known/oauth-protected-resource"' });
  }
  if (!auth.installationIdHash) return jsonResponse({ error: "invalid_device_id" }, 400);

  try {
    const result = await ctx.runQuery(internal.snapshots.inspectRun, { ...auth, installationIdHash: auth.installationIdHash, runId });
    if (!result) return jsonResponse({ error: "snapshot_not_found" }, 404);
    return jsonResponse({ ok: true, ...result });
  } catch (error) {
    const message = String(error);
    if (message.includes("DEVICE_ID_MISMATCH")) return jsonResponse({ error: "device_identity_mismatch" }, 409);
    if (message.includes("INVALID_COLLECTOR")) return jsonResponse({ error: "unauthorized" }, 401, { "www-authenticate": 'Bearer resource_metadata="https://usagemax.com/.well-known/oauth-protected-resource"' });
    return jsonResponse({ error: "snapshot_status_unavailable" }, 503);
  }
});

const revokeDevice = httpAction(async (ctx, request) => {
  try {
    const auth = await requiredAuthorizationContext(request);
    const result = await ctx.runMutation(internal.snapshots.revokeSelf, { ...auth, now: Date.now() });
    return jsonResponse({ ok: true, ...result });
  } catch (error) {
    const message = String(error);
    if (message.includes("RATE_LIMITED")) return jsonResponse({ error: "rate_limited" }, 429, { "retry-after": "60" });
    if (message.includes("INVALID_DEVICE_ID")) return jsonResponse({ error: "invalid_device_id" }, 400);
    const unauthorized = message.includes("INVALID_COLLECTOR") || message.includes("UNAUTHORIZED");
    return jsonResponse({ error: unauthorized ? "unauthorized" : "revoke_failed" }, unauthorized ? 401 : 500);
  }
});

const collectorStatus = httpAction(async (ctx, request) => {
  let auth: { keyHash: string; installationIdHash?: string };
  try {
    auth = await authorizationContext(request);
  } catch (error) {
    if (String(error).includes("INVALID_DEVICE_ID")) return jsonResponse({ error: "invalid_device_id" }, 400);
    return jsonResponse(
      {
        error: "unauthorized",
        message: "A valid UsageMax collector token is required.",
        hint: "Send the token in Authorization and never put it in a URL or request body.",
      },
      401,
      { "www-authenticate": 'Bearer resource_metadata="https://usagemax.com/.well-known/oauth-protected-resource"' },
    );
  }

  try {
    const result = await ctx.runQuery(internal.account.inspectCollector, auth);
    if (!result) {
      return jsonResponse(
        {
          error: "unauthorized",
          message: "UsageMax could not authenticate this collector token.",
          hint: "Confirm that the key was created in this UsageMax account and has not been replaced or revoked.",
        },
        401,
        { "www-authenticate": 'Bearer resource_metadata="https://usagemax.com/.well-known/oauth-protected-resource"' },
      );
    }
    return jsonResponse(
      { ok: result.status === "active", ...result },
      result.status === "device_mismatch" ? 409 : 200,
    );
  } catch {
    return jsonResponse({ error: "collector_status_unavailable" }, 503);
  }
});

const workosLifecycle = httpAction(async (ctx, request) => {
  const secret = process.env.WORKOS_WEBHOOK_SECRET;
  const clientId = process.env.WORKOS_CLIENT_ID;
  if (!secret || !clientId) return jsonResponse({ error: "webhook_not_configured" }, 503);
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declaredLength) || declaredLength < 0 || declaredLength > 262_144) {
    return jsonResponse({ error: "payload_too_large" }, 413);
  }
  const payload = await request.text();
  if (payload.length > 262_144) return jsonResponse({ error: "payload_too_large" }, 413);
  const sigHeader = request.headers.get("workos-signature");
  if (!sigHeader) return jsonResponse({ error: "signature_required" }, 401);

  try {
    const workos = new WorkOS({ clientId });
    const verified = await workos.webhooks.constructEvent({ payload, sigHeader, secret });
    const envelope = object(verified);
    const data = object(envelope?.data);
    const eventId = optionalText(envelope?.id, 120);
    const eventName = optionalText(envelope?.event, 120);
    if (!envelope || !eventId || !eventName || !data) return jsonResponse({ error: "invalid_event" }, 400);
    const supported = eventName === "organization.updated"
      || eventName === "organization.deleted"
      || eventName === "organization_membership.created"
      || eventName === "organization_membership.updated"
      || eventName === "organization_membership.deleted"
      || eventName === "dsync.activated"
      || eventName === "dsync.deleted"
      || eventName === "dsync.user.created"
      || eventName === "dsync.user.updated"
      || eventName === "dsync.user.deleted"
      || eventName === "dsync.group.created"
      || eventName === "dsync.group.updated"
      || eventName === "dsync.group.deleted"
      || eventName === "dsync.group.user_added"
      || eventName === "dsync.group.user_removed";
    if (!supported) return jsonResponse({ ok: true, ignored: true });

    if (eventName.startsWith("dsync.")) {
      const directory = object(data.directory) ?? (data.object === "directory" ? data : null);
      const directoryUser = object(data.user) ?? (directory ? null : data);
      const userEvent = eventName.startsWith("dsync.user.") || eventName.startsWith("dsync.group.user_");
      const role = object(directoryUser?.role);
      const roleSlugs = array(directoryUser?.roles)
        .map((entry) => optionalText(object(entry)?.slug, 80))
        .filter((entry): entry is string => Boolean(entry));
      const singleRole = optionalText(role?.slug, 80);
      if (singleRole && !roleSlugs.includes(singleRole)) roleSlugs.unshift(singleRole);
      const organizationId = optionalText(
        data.organizationId ?? data.organization_id
          ?? directory?.organizationId ?? directory?.organization_id
          ?? directoryUser?.organizationId ?? directoryUser?.organization_id,
        120,
      );
      if (!organizationId) return jsonResponse({ error: "organization_id_required" }, 400);
      const directoryId = optionalText(
        data.directoryId ?? data.directory_id ?? directory?.id
          ?? directoryUser?.directoryId ?? directoryUser?.directory_id,
        120,
      );
      const userId = userEvent ? optionalText(directoryUser?.id, 120) : undefined;
      const sourceTimestamp = typeof (directoryUser ?? directory)?.updatedAt === "string"
        ? (directoryUser ?? directory)?.updatedAt
        : typeof (directoryUser ?? directory)?.updated_at === "string"
          ? (directoryUser ?? directory)?.updated_at
          : envelope.createdAt ?? envelope.created_at;
      const parsedOccurredAt = typeof sourceTimestamp === "string" ? Date.parse(sourceTimestamp) : NaN;
      const result = await ctx.runMutation(internal.workos.applyDirectoryEvent, {
        eventId,
        eventName,
        organizationId,
        directoryId,
        directoryName: optionalText(directory?.name, 160),
        directoryType: optionalText(directory?.type, 120),
        directoryUserId: userId,
        email: optionalText(directoryUser?.email, 254),
        name: optionalText(directoryUser?.name, 120),
        state: optionalText(directoryUser?.state, 30),
        roleSlugs,
        occurredAt: Number.isFinite(parsedOccurredAt) ? Math.round(parsedOccurredAt) : Date.now(),
        now: Date.now(),
      });
      return jsonResponse({ ok: true, replay: result.replay, outcome: result.outcome });
    }

    const organizationId = optionalText(
      eventName.startsWith("organization_membership.") ? data.organizationId ?? data.organization_id : data.id,
      120,
    );
    if (!organizationId) return jsonResponse({ error: "organization_id_required" }, 400);
    const role = object(data.role);
    const roleSlugs = array(data.roles)
      .map((entry) => optionalText(object(entry)?.slug, 80))
      .filter((entry): entry is string => Boolean(entry));
    const singleRole = optionalText(role?.slug, 80);
    if (singleRole && !roleSlugs.includes(singleRole)) roleSlugs.unshift(singleRole);
    const sourceTimestamp = typeof data.updatedAt === "string"
      ? data.updatedAt
      : typeof data.updated_at === "string"
        ? data.updated_at
        : envelope.createdAt ?? envelope.created_at;
    const parsedOccurredAt = typeof sourceTimestamp === "string" ? Date.parse(sourceTimestamp) : NaN;
    const result = await ctx.runMutation(internal.workos.applyLifecycleEvent, {
      eventId,
      eventName,
      organizationId,
      userId: optionalText(data.userId ?? data.user_id, 120),
      status: optionalText(data.status, 30),
      roleSlugs,
      directoryManaged: typeof data.directoryManaged === "boolean"
        ? data.directoryManaged
        : typeof data.directory_managed === "boolean"
          ? data.directory_managed
          : undefined,
      organizationName: optionalText(data.name, 120),
      occurredAt: Number.isFinite(parsedOccurredAt) ? Math.round(parsedOccurredAt) : Date.now(),
      now: Date.now(),
    });
    return jsonResponse({ ok: true, replay: result.replay, outcome: result.outcome });
  } catch (error) {
    const message = String(error).toLowerCase();
    if (message.includes("signature") || message.includes("timestamp")) {
      return jsonResponse({ error: "invalid_signature" }, 401);
    }
    return jsonResponse({ error: "webhook_processing_failed" }, 500);
  }
});

const stripeWebhook = httpAction(async (ctx, request) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return jsonResponse({ error: "webhook_not_configured" }, 503);
  const payload = await request.text();
  if (payload.length > 262_144)
    return jsonResponse({ error: "payload_too_large" }, 413);
  const signature = request.headers.get("stripe-signature");
  if (!signature || !(await verifyStripeSignature(payload, signature, secret)))
    return jsonResponse({ error: "invalid_signature" }, 401);
  let envelope: JsonObject;
  try {
    const parsed = JSON.parse(payload);
    const value = object(parsed);
    if (!value) throw new Error("invalid_event");
    envelope = value;
  } catch {
    return jsonResponse({ error: "invalid_event" }, 400);
  }
  const eventId = optionalText(envelope.id, 120);
  const eventType = optionalText(envelope.type, 120);
  const data = object(envelope.data);
  const eventObject = object(data?.object);
  if (!eventId || !eventType || !eventObject)
    return jsonResponse({ error: "invalid_event" }, 400);

  const metadata = object(eventObject.metadata);
  const customerId = optionalText(
    eventObject.customer ?? eventObject.customer_id,
    100,
  );
  const subscriptionValue = eventObject.subscription;
  const subscriptionId = optionalText(
    typeof subscriptionValue === "string"
      ? subscriptionValue
      : eventType.startsWith("customer.subscription.")
        ? eventObject.id
        : undefined,
    100,
  );
  const items = object(eventObject.items);
  const itemList = Array.isArray(items?.data) ? items.data : [];
  const firstItem = object(itemList[0]);
  const price = object(firstItem?.price);
  const quantity = typeof firstItem?.quantity === "number" ? firstItem.quantity : undefined;
  const periodEnd = typeof eventObject.current_period_end === "number"
    ? Math.round(eventObject.current_period_end * 1000)
    : undefined;
  const status = billingStatus(eventObject.status)
    ?? (eventType === "checkout.session.completed" || eventType === "invoice.paid"
      ? "active"
      : eventType === "invoice.payment_failed"
        ? "past_due"
        : eventType === "customer.subscription.deleted"
          ? "canceled"
          : undefined);
  await ctx.scheduler.runAfter(0, internal.billing.applyStripeEvent, {
    eventId,
    eventType,
    customerId,
    subscriptionId,
    priceId: optionalText(price?.id, 100),
    tier: billingTier(metadata?.tier),
    status,
    seatQuantity: quantity,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: typeof eventObject.cancel_at_period_end === "boolean"
      ? eventObject.cancel_at_period_end
      : undefined,
    invoiceId: eventType.startsWith("invoice.")
      ? optionalText(eventObject.id, 100)
      : undefined,
  });
  return jsonResponse({ ok: true, accepted: true });
});

const http = httpRouter();
const cors = httpAction(async (_ctx, request) => {
  const origin = request.headers.get("origin");
  const allowed = origin === "https://usagemax.com"
    || /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin ?? "");
  return new Response(null, {
    status: 204,
    headers: allowed ? {
      "access-control-allow-origin": origin!,
      "access-control-allow-headers": "authorization, content-type, idempotency-key, x-usagemax-device-id",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-max-age": "86400",
      vary: "Origin",
    } : {},
  });
});

http.route({ path: "/health", method: "GET", handler: httpAction(async () => jsonResponse({ ok: true, service: "usagemax-ingest", storage: "convex", protocol: 2, recommendedCliVersion: RECOMMENDED_CLI_VERSION })) });
http.route({ path: "/v1/devices/link", method: "POST", handler: linkDevice });
http.route({ path: "/v1/devices/status", method: "GET", handler: collectorStatus });
http.route({ path: "/v1/devices/revoke", method: "POST", handler: revokeDevice });
http.route({ path: "/v1/billing/stripe-webhook", method: "POST", handler: stripeWebhook });
http.route({ pathPrefix: "/v2/usage/snapshots/", method: "GET", handler: snapshotStatus });
http.route({ pathPrefix: "/v2/usage/snapshots/", method: "OPTIONS", handler: cors });
http.route({ path: "/v2/usage/snapshots", method: "POST", handler: snapshots });
http.route({ path: "/v1/telemetry/llm", method: "POST", handler: httpAction((ctx, request) => ingest(ctx, request, "native")) });
http.route({ path: "/v1/telemetry/llm", method: "OPTIONS", handler: cors });
http.route({ path: "/v1/traces", method: "POST", handler: httpAction((ctx, request) => ingest(ctx, request, "otlp")) });
http.route({ path: "/v1/traces", method: "OPTIONS", handler: cors });
http.route({ path: "/v1/workos/events", method: "POST", handler: workosLifecycle });

export default http;
