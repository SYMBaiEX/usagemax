const MIN_EVENT_TIME = Date.UTC(2024, 0, 1);
const MAX_FUTURE_SKEW_MS = 5 * 60_000;

export const SANDBOX_EVENT_FIELDS = [
  "eventKey", "logicalRequestId", "sessionId", "agentId", "agentExternalId", "parentAgentId", "parentAgentExternalId", "agentName",
  "eventType", "source", "provider", "requestedModel", "model", "inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens",
  "reasoningTokens", "totalTokens", "costMicros", "costBasis", "pricingSource", "pricingVersion", "serviceTier", "region", "currency",
  "projectId", "costCenter", "latencyMs", "timeToFirstTokenMs", "status", "state", "task", "traceId", "spanId", "occurredAt", "schemaVersion",
  "completeness", "accountingMode",
] as const;

const eventFields = new Set<string>(SANDBOX_EVENT_FIELDS);

const optionalTextFields: Record<string, number> = {
  logicalRequestId: 160,
  sessionId: 160,
  agentId: 160,
  agentExternalId: 160,
  parentAgentId: 160,
  parentAgentExternalId: 160,
  agentName: 80,
  source: 60,
  provider: 60,
  requestedModel: 120,
  pricingSource: 120,
  pricingVersion: 120,
  serviceTier: 40,
  region: 60,
  currency: 3,
  projectId: 80,
  costCenter: 80,
  state: 40,
  task: 180,
  traceId: 64,
  spanId: 32,
};

const counterFields: Record<string, number> = {
  inputTokens: 1_000_000_000_000,
  outputTokens: 1_000_000_000_000,
  cacheReadTokens: 1_000_000_000_000,
  cacheWriteTokens: 1_000_000_000_000,
  reasoningTokens: 1_000_000_000_000,
  totalTokens: 1_000_000_000_000,
  costMicros: 1_000_000_000_000_000,
};

const durationFields: Record<string, number> = {
  latencyMs: 86_400_000,
  timeToFirstTokenMs: 86_400_000,
};

const enumFields: Record<string, readonly string[]> = {
  eventType: ["model_request", "tool_call", "agent_state", "outcome"],
  status: ["ok", "error", "cancelled"],
  costBasis: ["reported", "estimated", "unknown"],
  completeness: ["reported", "estimated", "unknown"],
  accountingMode: ["accounting", "observability"],
};

function validTimestamp(value: unknown, now: number) {
  const parsed = typeof value === "number"
    ? Number.isSafeInteger(value) ? value : Number.NaN
    : typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= MIN_EVENT_TIME && parsed <= now + MAX_FUTURE_SKEW_MS;
}

function validText(value: unknown, maximum: number, required = false) {
  if (typeof value !== "string") return false;
  if ((required || value.length > 0) && value.trim().length === 0) return false;
  return value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value);
}

function validInteger(value: unknown, maximum: number) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}

/**
 * Validate the fields that the authenticated native ingestion path accepts.
 * The sandbox is intentionally stricter than the historical clamping behavior:
 * a successful preflight must not hide malformed telemetry from an integrator.
 */
export function validateSandboxEvent(value: unknown, now = Date.now()): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "event_must_be_an_object";
  const event = value as Record<string, unknown>;
  if (Object.keys(event).some((key) => !eventFields.has(key))) return "unknown_event_field";
  if (!validText(event.eventKey, 180, true)) return "invalid_event_key";
  if (!validText(event.model, 120, true)) return "invalid_model";
  if (!validTimestamp(event.occurredAt, now)) return "invalid_occurred_at";

  for (const [field, maximum] of Object.entries(optionalTextFields)) {
    if (event[field] !== undefined && !validText(event[field], maximum)) return `invalid_${field}`;
  }
  for (const [field, maximum] of Object.entries(counterFields)) {
    if (event[field] !== undefined && !validInteger(event[field], maximum)) return `invalid_${field}`;
  }
  for (const [field, maximum] of Object.entries(durationFields)) {
    if (event[field] !== undefined && !validInteger(event[field], maximum)) return `invalid_${field}`;
  }
  for (const [field, values] of Object.entries(enumFields)) {
    if (event[field] !== undefined && (typeof event[field] !== "string" || !values.includes(event[field]))) return `invalid_${field}`;
  }
  const inputTokens = typeof event.inputTokens === "number" ? event.inputTokens : 0;
  const outputTokens = typeof event.outputTokens === "number" ? event.outputTokens : 0;
  const totalTokens = typeof event.totalTokens === "number" ? event.totalTokens : undefined;
  const cacheTokens = (typeof event.cacheReadTokens === "number" ? event.cacheReadTokens : 0)
    + (typeof event.cacheWriteTokens === "number" ? event.cacheWriteTokens : 0);
  const reasoningTokens = typeof event.reasoningTokens === "number" ? event.reasoningTokens : 0;
  if (cacheTokens > inputTokens) return "invalid_cache_tokens";
  if (reasoningTokens > outputTokens) return "invalid_reasoning_tokens";
  if (totalTokens !== undefined && totalTokens < inputTokens + outputTokens) return "invalid_total_tokens";
  if (event.schemaVersion !== undefined && (event.schemaVersion !== 1 && event.schemaVersion !== 2)) return "invalid_schema_version";
  return null;
}
