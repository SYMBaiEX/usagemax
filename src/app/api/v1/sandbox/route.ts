import { apiResponse } from "@/lib/api-response";

export const dynamic = "force-static";

const descriptor = {
  environment: "sandbox",
  service: "UsageMax content-free telemetry validator",
  writes: false,
  authentication: "none",
  endpoint: "https://usagemax.com/api/v1/sandbox/validate",
  method: "POST",
  contentType: "application/json",
  limits: { maxBytes: 16_384, maxEvents: 100 },
  aliases: ["https://usagemax.com/api/v1/batch/validate"],
  acceptedFields: [
    "eventKey", "logicalRequestId", "sessionId", "agentId", "agentExternalId", "parentAgentId", "parentAgentExternalId", "agentName",
    "eventType", "source", "provider", "requestedModel", "model", "inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens",
    "reasoningTokens", "totalTokens", "costMicros", "costBasis", "pricingSource", "pricingVersion", "serviceTier", "region", "currency",
    "projectId", "costCenter", "latencyMs", "timeToFirstTokenMs", "status", "state", "task", "traceId", "spanId", "occurredAt", "schemaVersion",
    "completeness", "accountingMode",
  ],
  validation: "strict; timestamps must be from 2024-01-01 through five minutes in the future; counters and durations are non-negative integers; enum values follow OpenAPI",
  example: {
    events: [{ eventKey: "sandbox-example-1", model: "example-model", occurredAt: "2026-09-16T12:00:00Z", eventType: "model_request", totalTokens: 0, costMicros: 0 }],
  },
  documentation: "https://usagemax.com/sandbox",
};

export function GET() {
  const response = apiResponse(descriptor);
  response.headers.set("cache-control", "public, max-age=300, s-maxage=300");
  return response;
}

export function HEAD() {
  return new Response(null, {
    headers: {
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=300, s-maxage=300",
      "content-type": "application/json; charset=utf-8",
      "x-api-version": "1",
    },
  });
}
