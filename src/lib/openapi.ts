const error = {
  type: "object",
  required: ["error", "message", "hint", "documentation"],
  properties: {
    error: { type: "string", description: "Stable machine-readable error code.", example: "unauthorized" },
    message: { type: "string", description: "Human-readable explanation.", example: "A valid UsageMax collector token is required." },
    hint: { type: "string", description: "Actionable recovery guidance.", example: "Link this computer and send the bearer token in Authorization." },
    documentation: { type: "string", format: "uri", description: "Canonical documentation reference for this error contract.", example: "https://usagemax.com/docs" },
  },
};
const bearer = { type: "http", scheme: "bearer", bearerFormat: "UsageMax collector token (umx_ plus 64 lowercase hex characters)" };
const deviceHeader = { name: "x-usagemax-device-id", in: "header", required: true, schema: { type: "string", format: "uuid" }, description: "Stable installation UUID; it is hashed server-side." };
const json = { required: true, content: { "application/json": { schema: { type: "object" } } } };
const linkRequest = {
  required: true,
  content: {
    "application/json": {
      schema: {
        type: "object",
        required: ["code"],
        additionalProperties: false,
        properties: {
          code: { type: "string", pattern: "^UMX-[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){3}$" },
          name: { type: "string", maxLength: 80, description: "Optional explicit computer name. If omitted, the name selected in the authenticated account link is used." },
          nameExplicit: { type: "boolean", description: "Set by current CLIs only when --name was supplied; omitted for backward compatibility." },
          platform: { type: "string", maxLength: 24 },
          cliVersion: { type: "string", maxLength: 24 },
          deviceId: { type: "string", format: "uuid" },
        },
      },
    },
  },
};
const response = (description: string, schema: unknown, examples?: unknown) => ({ description, content: { "application/json": { schema, ...(examples ? { examples } : {}) } } });
const errorResponse = (description = "A stable API error code.") => response(description, error);
const snapshotStatusResponse = {
  type: "object",
  required: ["ok", "runId", "status", "statusUrl", "sourceCount", "partitionCount", "acceptedPartitions", "changedRows", "correctionRows", "startedAt", "updatedAt"],
  properties: {
    ok: { type: "boolean" },
    runId: { type: "string" },
    status: { type: "string", enum: ["scanning", "uploading", "complete", "failed"] },
    mode: { type: "string", enum: ["incremental", "full", "archives"] },
    baselineMode: { type: ["string", "null"], enum: ["apply", "adopt-current", null] },
    statusUrl: { type: "string", format: "uri" },
    sourceCount: { type: "integer" },
    partitionCount: { type: "integer" },
    acceptedPartitions: { type: "integer" },
    pendingCleanups: { type: "integer" },
    changedRows: { type: "integer" },
    correctionRows: { type: "integer" },
    inventoryComplete: { type: "boolean" },
    inventoryErrors: { type: "integer" },
    inventoryTruncated: { type: "boolean" },
    coverageStartDay: { type: ["string", "null"], format: "date" },
    coverageEndDay: { type: ["string", "null"], format: "date" },
    failureCode: { type: ["string", "null"] },
    startedAt: { type: "integer" },
    completedAt: { type: ["integer", "null"] },
    updatedAt: { type: "integer" },
  },
};
const nlwebRequest = { type: "object", required: ["query"], properties: { query: { oneOf: [{ type: "string", minLength: 1, maxLength: 500 }, { type: "object", required: ["text"], properties: { text: { type: "string", minLength: 1, maxLength: 500 } }, additionalProperties: false }] }, streaming: { type: "boolean", default: false }, prefer: { type: "object", properties: { streaming: { type: "boolean" } }, additionalProperties: false }, query_id: { type: "string", maxLength: 120 } }, additionalProperties: false };
const nlwebResponse = { $ref: "#/components/schemas/NlwebResponse" };
const a2aRequest = {
  type: "object",
  required: ["jsonrpc", "id", "method", "params"],
  additionalProperties: false,
  properties: {
    jsonrpc: { const: "2.0" },
    id: { oneOf: [{ type: "string" }, { type: "integer" }, { type: "null" }] },
    method: { enum: ["SendMessage", "message/send"] },
    params: {
      type: "object",
      required: ["message"],
      additionalProperties: false,
      properties: {
        message: {
          type: "object",
          required: ["parts"],
          additionalProperties: false,
          properties: {
            parts: {
              type: "array",
              minItems: 1,
              maxItems: 8,
              items: { type: "object", required: ["text"], additionalProperties: false, properties: { text: { type: "string", minLength: 1, maxLength: 500 } } },
            },
          },
        },
      },
    },
  },
};
const a2aResponse = {
  type: "object",
  properties: {
    jsonrpc: { const: "2.0" },
    id: { oneOf: [{ type: "string" }, { type: "integer" }, { type: "null" }] },
    result: {
      type: "object",
      properties: {
        message: {
          type: "object",
          properties: {
            messageId: { type: "string" },
            role: { const: "ROLE_AGENT" },
            parts: { type: "array", items: { type: "object", properties: { text: { type: "string" } } } },
          },
        },
      },
    },
  },
};

const batchValidationOperation = {
  tags: ["Public reads"],
  operationId: "validateTelemetryBatchRootAlias",
  description: "Alias of /api/v1/sandbox/validate. Strict no-write validation of the content-free telemetry batch shape; input is never stored.",
  requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/NativeTelemetryBatch" } } } },
  responses: {
    "200": response("Input is valid and was not stored.", { type: "object", required: ["ok", "accepted", "writes"], properties: { ok: { type: "boolean" }, accepted: { type: "integer" }, writes: { const: false }, message: { type: "string" } } }),
    "400": errorResponse("invalid_sandbox_input"),
    "413": errorResponse("payload_too_large"),
    "415": errorResponse("content_type_must_be_application_json"),
  },
};

const openapi = {
  openapi: "3.1.0",
  jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
  info: { title: "UsageMax API", version: "1.0.0", description: "API version 1. Public UsageMax read APIs and the authenticated, content-free CLI ingestion contract. UsageMax never accepts prompts, completions, source code, file paths, tool arguments, or secrets. Version 1 is supported; deprecated endpoints return Deprecation and Sunset headers.", contact: { name: "UsageMax", url: "https://usagemax.com/contact", email: "hello@usagemax.com" }, license: { name: "MIT", url: "https://github.com/SYMBaiEX/usagemax/blob/main/LICENSE" } },
  servers: [{ url: "https://usagemax.com", description: "Production API" }],
  tags: [{ name: "Public reads" }, { name: "CLI ingestion" }, { name: "Agent protocols" }],
  paths: {
    "/api/v2/usage/snapshots/{runId}": { get: { tags: ["CLI ingestion"], operationId: "getUsageSnapshotStatus", description: "Read the current status of one authenticated snapshot run. The run is scoped to the collector bearer token and installation UUID; no workspace or profile identifiers are returned.", security: [{ collectorBearer: [] }], parameters: [{ ...deviceHeader, description: "Stable installation UUID used by the snapshot run; it is hashed server-side." }, { name: "runId", in: "path", required: true, schema: { type: "string", minLength: 1, maxLength: 80, pattern: "^[A-Za-z0-9._:-]+$" } }], responses: { "200": response("Current snapshot run status.", snapshotStatusResponse), "400": errorResponse("invalid_snapshot_run_id or invalid_device_id"), "401": errorResponse("unauthorized"), "404": errorResponse("snapshot_not_found"), "409": errorResponse("device_identity_mismatch"), "503": errorResponse("snapshot_status_unavailable") } } },
    "/a2a": { post: { tags: ["Agent protocols"], operationId: "sendA2AMessage", description: "Answer one bounded public UsageMax question over JSON-RPC 2.0 using the A2A SendMessage or standard message/send method alias. This interface is read-only, does not create or persist tasks, and accepts text parts only; requests are capped at 32 KiB and questions at 500 characters.", requestBody: { required: true, content: { "application/json": { schema: a2aRequest }, "application/a2a+json": { schema: a2aRequest } } }, responses: { "200": response("A direct A2A message or JSON-RPC error.", a2aResponse), "415": errorResponse("content_type_must_be_application_json"), "400": errorResponse("invalid_request or invalid_params") } } },
    "/ask": { get: { tags: ["Public reads"], operationId: "askUsageMax", description: "Answer a bounded natural-language question about UsageMax using only first-party public resources. Set streaming=true and advertise text/event-stream for an SSE response; otherwise JSON is returned. No credentials are accepted or required.", parameters: [{ name: "query", in: "query", required: true, schema: { type: "string", minLength: 1, maxLength: 500 } }, { name: "streaming", in: "query", schema: { type: "boolean", default: false } }, { name: "query_id", in: "query", schema: { type: "string", maxLength: 120 } }], responses: { "200": { description: "A cited answer in JSON or a finite SSE event stream.", content: { "application/json": { schema: nlwebResponse }, "text/event-stream": { schema: { type: "string" } } } }, "400": errorResponse("missing_query or invalid request") } }, post: { tags: ["Public reads"], operationId: "askUsageMaxPost", description: "Answer a bounded natural-language question about UsageMax from a JSON request. Use prefer.streaming=true for a finite SSE response. The endpoint is deterministic and cites only UsageMax URLs; it does not call an external model.", requestBody: { required: true, content: { "application/json": { schema: nlwebRequest } } }, responses: { "200": { description: "A cited answer in JSON or a finite SSE event stream.", content: { "application/json": { schema: nlwebResponse }, "text/event-stream": { schema: { type: "string" } } } }, "400": errorResponse("missing_query or invalid request"), "413": errorResponse("payload_too_large"), "415": errorResponse("content_type_must_be_application_json") } } },
    "/api": { get: { tags: ["Public reads"], operationId: "getApiEntryPoint", description: "API entry point. It returns a machine-readable authentication hint and links to public read operations and the OpenAPI contract; it is not itself a data resource.", responses: { "401": { description: "Use a documented public endpoint or authenticate a collector request.", headers: { "WWW-Authenticate": { schema: { type: "string" }, description: "Protected-resource metadata URL." }, "Link": { schema: { type: "string" }, description: "OpenAPI and API guide links." } }, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } } } } },
    "/api/health": { get: { tags: ["Public reads"], operationId: "getHealth", description: "Return service, storage, realtime, collector capability, and network update status. Public; no authentication.", responses: { "200": response("Health status.", { type: "object", required: ["ok", "service", "storage", "realtime", "collector", "updatedAt"], properties: { ok: { type: "boolean", example: true }, service: { type: "string", example: "usagemax" }, storage: { type: "string", example: "convex" }, realtime: { type: "boolean", example: true }, collector: { $ref: "#/components/schemas/CollectorCapabilities" }, updatedAt: { type: ["integer", "null"], example: 1735689600000 } } }) } } },
    "/api/stats": { get: { tags: ["Public reads"], operationId: "getNetworkStats", description: "Return the public aggregate network statistics. Public; no authentication.", responses: { "200": response("Network statistics.", { type: "object", required: ["stats"], properties: { stats: { $ref: "#/components/schemas/NetworkStats" } } }) } } },
    "/api/leaderboard": { get: { tags: ["Public reads"], operationId: "getLeaderboard", description: "Return the public leaderboard, limited to 100 rows. Invalid metric or window returns a stable error.", parameters: [{ name: "metric", in: "query", schema: { type: "string", enum: ["tokens", "spend"], default: "tokens" } }, { name: "window", in: "query", description: "`period` is accepted as a legacy alias.", schema: { type: "string", enum: ["7d", "30d", "all"], default: "all" } }, { name: "period", in: "query", schema: { type: "string", enum: ["7d", "30d", "all"] } }], responses: { "200": response("Leaderboard rows.", { type: "object", required: ["metric", "window", "generatedAt", "leaderboard"], properties: { metric: { type: "string" }, window: { type: "string" }, generatedAt: { type: "string", format: "date-time" }, leaderboard: { type: "array", maxItems: 100, items: { $ref: "#/components/schemas/LeaderboardRow" } } } }), "400": errorResponse("invalid_metric or invalid_window") } } },
    "/api/profiles/{handle}": { get: { tags: ["Public reads"], operationId: "getPublicProfile", description: "Return an opt-in public profile, aggregate statistics, and up to 12 model totals.", parameters: [{ name: "handle", in: "path", required: true, schema: { type: "string", minLength: 1 } }], responses: { "200": response("Public profile.", { $ref: "#/components/schemas/PublicProfile" }), "404": errorResponse("profile_not_found") } } },
    "/api/profiles/{handle}/daily": { get: { tags: ["Public reads"], operationId: "getProfileDailyUsage", description: "Return public daily usage. The `days` value is rounded and clamped by the route to 1–365; model/source/device breakdowns are selected with groupBy.", parameters: [{ name: "handle", in: "path", required: true, schema: { type: "string" } }, { name: "days", in: "query", schema: { type: "integer", minimum: 1, maximum: 365, default: 365 } }, { name: "groupBy", in: "query", schema: { type: "string", enum: ["model", "source", "device"] } }], responses: { "200": response("Daily usage rows.", { type: "object", required: ["days"], properties: { groupBy: { type: "string" }, range: { $ref: "#/components/schemas/Range" }, days: { type: "array", items: { $ref: "#/components/schemas/DailyRow" } } } }), "422": errorResponse("The summary is too large; follow the detail endpoint.") } } },
    "/api/profiles/{handle}/daily/detail": { get: { tags: ["Public reads"], operationId: "getProfileDailyDetail", description: "Return additive, paginated public detail rows. Supply inclusive ISO dates and sum rows across pages before claiming range totals. Reads are bounded to 500 rows and 1 MiB per query.", parameters: [{ name: "handle", in: "path", required: true, schema: { type: "string" } }, { name: "groupBy", in: "query", required: true, schema: { type: "string", enum: ["model", "source", "device"] } }, { name: "from", in: "query", required: true, schema: { type: "string", format: "date" } }, { name: "through", in: "query", required: true, schema: { type: "string", format: "date" } }, { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 500, default: 100 } }, { name: "cursor", in: "query", schema: { type: "string", maxLength: 8192 } }], responses: { "200": response("One additive page.", { $ref: "#/components/schemas/DetailPage" }), "400": errorResponse("invalid_detail_parameters or invalid_pagination_cursor"), "503": errorResponse("public_detail_unavailable") } } },
    "/api/v1/screen/{handle}": { get: { tags: ["Public reads"], operationId: "getRetiredScreenApi", deprecated: true, description: "This formerly public screen endpoint is retired; the local HUD is a separate project. The response includes Deprecation and Sunset headers.", parameters: [{ name: "handle", in: "path", required: true, schema: { type: "string" } }], responses: { "410": errorResponse("screen_api_retired") } } },
    "/api/v1/sandbox": { get: { tags: ["Public reads"], operationId: "getSandboxDescriptor", description: "Describe the no-write sandbox validation environment, limits, accepted fields, and example. Public and unauthenticated.", responses: { "200": response("Sandbox descriptor.", { $ref: "#/components/schemas/SandboxDescriptor" }) } } },
    "/api/v1/sandbox/validate": { post: { tags: ["Public reads"], operationId: "validateTelemetryBatch", description: "Strict no-write validation of the existing content-free telemetry batch shape. Public, unauthenticated, bounded to 16 KiB and 100 events; prompts, completions, secrets, and unknown fields are rejected.", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/NativeTelemetryBatch" } } } }, responses: { "200": response("Input is valid and was not stored.", { type: "object", required: ["ok", "accepted", "writes"], properties: { ok: { type: "boolean" }, accepted: { type: "integer" }, writes: { const: false }, message: { type: "string" } } }), "400": errorResponse("invalid_sandbox_input"), "413": errorResponse("payload_too_large"), "415": errorResponse("content_type_must_be_application_json") } } },
    "/api/v1/batch": { get: { tags: ["Public reads"], operationId: "getBatchValidationDescriptor", description: "Describe the public no-write batch validation alias and its bounded content-free event contract.", responses: { "200": response("Batch validation descriptor.", { type: "object", properties: { environment: { const: "sandbox" }, writes: { const: false }, endpoint: { type: "string", format: "uri" }, aliases: { type: "array", items: { type: "string", format: "uri" } }, canonicalEndpoint: { type: "string", format: "uri" } } }) } }, post: batchValidationOperation },
    "/api/v1/batch/validate": { post: { tags: ["Public reads"], operationId: "validateTelemetryBatchAlias", description: "Alias of /api/v1/sandbox/validate. Strict no-write validation of the content-free telemetry batch shape; input is never stored.", requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/NativeTelemetryBatch" } } } }, responses: { "200": response("Input is valid and was not stored.", { type: "object", required: ["ok", "accepted", "writes"], properties: { ok: { type: "boolean" }, accepted: { type: "integer" }, writes: { const: false }, message: { type: "string" } } }), "400": errorResponse("invalid_sandbox_input"), "413": errorResponse("payload_too_large"), "415": errorResponse("content_type_must_be_application_json") } } },
    "/api/v1/devices/link": { post: { tags: ["CLI ingestion"], operationId: "linkCliDevice", description: "Redeem a one-use UMX link code and return a newly generated write-only collector token. Authentication is optional only to replace a prior linked token; never put a token in the request body or documentation examples. The name selected in the authenticated account link is authoritative unless a current CLI explicitly supplies --name.", parameters: [{ name: "authorization", in: "header", required: false, schema: { type: "string" } }, { name: "x-usagemax-device-id", in: "header", required: false, schema: { type: "string", format: "uuid" } }], requestBody: linkRequest, responses: { "200": response("Linked device and token endpoints. The token is shown once.", { $ref: "#/components/schemas/LinkResponse" }), "400": errorResponse("invalid_or_expired_link_code, invalid_device_id, invalid_json"), "409": errorResponse("collector_limit_reached"), "415": errorResponse("content_type_must_be_application_json"), "429": errorResponse("rate_limited"), "413": errorResponse("payload_too_large") } } },
    "/api/v1/devices/status": { get: { tags: ["CLI ingestion"], operationId: "inspectCollectorStatus", description: "Read the state of a collector credential without returning the credential or its hash. The response identifies whether the key is active, revoked, workspace-disabled, membership-disabled, or bound to a different installation. Supplying the device UUID checks the binding without echoing it.", security: [{ collectorBearer: [] }], parameters: [{ name: "x-usagemax-device-id", in: "header", required: false, schema: { type: "string", format: "uuid" }, description: "Optional stable installation UUID to check against the token binding." }], responses: { "200": response("Collector status; no secret is returned.", { $ref: "#/components/schemas/CollectorStatus" }), "400": errorResponse("invalid_device_id"), "401": errorResponse("unauthorized"), "409": response("The token is valid but the supplied installation UUID does not match its binding.", { $ref: "#/components/schemas/CollectorStatus" }), "503": errorResponse("collector_status_unavailable") } } },
    "/api/v1/devices/revoke": { post: { tags: ["CLI ingestion"], operationId: "revokeCliDevice", description: "Revoke the authenticated installation's collector credential. Requires the exact bearer token and matching installation UUID.", security: [{ collectorBearer: [] }], parameters: [deviceHeader], responses: { "200": response("Revocation result.", { type: "object", properties: { ok: { type: "boolean" } } }), "400": errorResponse("invalid_device_id"), "401": errorResponse("unauthorized"), "429": errorResponse("rate_limited") } } },
    "/api/v1/telemetry/llm": { post: { tags: ["CLI ingestion"], operationId: "ingestNativeTelemetry", description: "Accept 1–100 content-free native telemetry events. Requires JSON, bearer token, matching device UUID, and Idempotency-Key. Maximum request size is 1 MiB; identical replays are safe and key reuse with different content returns 409. IP/WAF and collector limits are 180 operations and 20,000 accepted items per minute with bounded burst capacity.", security: [{ collectorBearer: [] }], parameters: [deviceHeader, { name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", maxLength: 180 } }], requestBody: { ...json, content: { "application/json": { schema: { $ref: "#/components/schemas/NativeTelemetryBatch" }, example: { events: [{ eventKey: "request_01", model: "example-model", occurredAt: "2026-09-15T12:00:00Z", inputTokens: 1200, outputTokens: 800, totalTokens: 2000 }] } } } }, responses: { "200": response("Idempotent replay accepted.", { $ref: "#/components/schemas/IngestResponse" }), "202": response("Batch accepted for processing; the response is the receipt for the bounded write, and the client should continue its existing run flow. No polling URL is emitted because this endpoint has no status resource.", { $ref: "#/components/schemas/IngestResponse" }), "400": errorResponse("invalid event or request"), "401": errorResponse("unauthorized"), "409": errorResponse("device_identity_mismatch or idempotency_conflict"), "413": errorResponse("payload_too_large"), "415": errorResponse("content_type_must_be_application_json"), "429": errorResponse("rate_limited") } } },
    "/api/v1/traces": { post: { tags: ["CLI ingestion"], operationId: "ingestOtlpTraces", description: "Accept OTLP/HTTP JSON resourceSpans and map supported GenAI attributes into the same content-free event contract. Protobuf and gzip are not supported. Requires JSON, bearer token, matching device UUID, and Idempotency-Key; maximum request size is 1 MiB.", security: [{ collectorBearer: [] }], parameters: [deviceHeader, { name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", maxLength: 180 } }], requestBody: { ...json, content: { "application/json": { schema: { $ref: "#/components/schemas/OtlpPayload" }, example: { resourceSpans: [] } } } }, responses: { "200": response("Idempotent replay accepted.", { $ref: "#/components/schemas/IngestResponse" }), "202": response("Batch accepted for processing.", { $ref: "#/components/schemas/IngestResponse" }), "400": errorResponse("invalid event or request"), "401": errorResponse("unauthorized"), "409": errorResponse("device_identity_mismatch or idempotency_conflict"), "413": errorResponse("payload_too_large"), "415": errorResponse("content_type_must_be_application_json"), "429": errorResponse("rate_limited") } } },
    "/api/v2/usage/snapshots": { post: { tags: ["CLI ingestion"], operationId: "uploadUsageSnapshot", description: "Process one authenticated snapshot operation: begin, sessions, partitions, complete, or fail. Requires JSON, bearer token, matching device UUID, and a 2 MiB maximum request. Sessions are capped at 100, partitions at 10 per request, and rows at 100 per partition; idempotent replay and correction conflicts are explicit.", security: [{ collectorBearer: [] }], parameters: [deviceHeader], requestBody: { ...json, content: { "application/json": { schema: { $ref: "#/components/schemas/SnapshotOperation" }, example: { operation: "begin", runId: "run_2026_09_15_01", mode: "incremental", sourceCount: 1, partitionCount: 1, inventoryComplete: true } } } }, responses: { "200": response("Completed, failed, or replayed operation.", { $ref: "#/components/schemas/SnapshotResponse" }), "202": { description: "Accepted snapshot operation; the response is the receipt for the current begin, sessions, or partition write. The client continues the same run and sends complete to publish it. Poll the authenticated status resource in Location or statusUrl with the same bearer token and installation UUID.", headers: { Location: { schema: { type: "string", format: "uri" }, description: "Read-only URL for the current snapshot run status." } }, content: { "application/json": { schema: { $ref: "#/components/schemas/SnapshotResponse" } } } }, "400": errorResponse("invalid_snapshot or request"), "401": errorResponse("unauthorized"), "409": errorResponse("snapshot_conflict or device_identity_mismatch"), "410": errorResponse("snapshot_run_expired"), "413": errorResponse("payload_too_large"), "415": errorResponse("content_type_must_be_application_json"), "429": errorResponse("rate_limited") } } }
  },
  components: { securitySchemes: { collectorBearer: bearer }, schemas: {
    NlwebResponse: { type: "object", required: ["_meta", "query_id", "answer", "results", "sources"], properties: { _meta: { type: "object", required: ["response_type", "version"], properties: { response_type: { type: "string", enum: ["answer", "failure"] }, version: { type: "string", example: "0.5" } } }, query_id: { type: "string" }, answer: { type: "string" }, results: { type: "array", maxItems: 5, items: { type: "object", required: ["url", "name", "site", "score", "description"], properties: { url: { type: "string", format: "uri" }, name: { type: "string" }, site: { type: "string" }, score: { type: "number", minimum: 0, maximum: 100 }, description: { type: "string" }, schema_object: { type: "object" } } } }, sources: { type: "array", items: { type: "string", format: "uri" } } } },
    Error: error,
    SandboxDescriptor: { type: "object", required: ["environment", "writes", "endpoint", "method", "contentType", "limits", "acceptedFields", "example"], properties: { environment: { const: "sandbox" }, service: { type: "string" }, writes: { const: false }, authentication: { const: "none" }, endpoint: { type: "string", format: "uri" }, aliases: { type: "array", items: { type: "string", format: "uri" } }, method: { const: "POST" }, contentType: { const: "application/json" }, limits: { type: "object", properties: { maxBytes: { type: "integer" }, maxEvents: { type: "integer" } } }, acceptedFields: { type: "array", items: { type: "string" } }, validation: { type: "string" }, example: { $ref: "#/components/schemas/NativeTelemetryBatch" }, documentation: { type: "string", format: "uri" } } },
    CollectorCapabilities: { type: "object", properties: { snapshotProtocol: { type: "integer", example: 2 }, snapshotChunks: { type: "boolean" }, maxChunkRows: { type: "integer", example: 100 }, recommendedCliVersion: { type: "string", example: "0.3.6" } } },
    NetworkStats: { type: "object", properties: { totalTokens: { type: "integer" }, totalCostMicros: { type: "integer" }, totalSessions: { type: "integer" }, profiles: { type: "integer" }, activeAgents: { type: "integer" }, eventsToday: { type: "integer" }, updatedAt: { type: "integer" } } },
    LeaderboardRow: { type: "object", properties: { rank: { type: "integer" }, user: { type: "object", properties: { login: { type: "string" }, name: { type: "string" }, avatarUrl: { type: ["string", "null"], format: "uri" } } }, score: { type: "number" }, totalTokens: { type: "integer" }, totalSpendUsd: { type: "number" }, costBasis: { type: "string" }, verification: { type: "string" }, updatedAt: { type: "integer" } } },
    PublicProfile: { type: "object", properties: { user: { type: "object" }, stats: { type: "object" }, models: { type: "array", items: { type: "object" } } } }, Range: { type: "object", properties: { first: { type: ["string", "null"], format: "date" }, last: { type: ["string", "null"], format: "date" } } }, DailyRow: { type: "object", properties: { date: { type: "string", format: "date" }, totalTokens: { type: "integer" }, outputTokens: { type: "integer" }, costUsd: { type: "number" }, sessions: { type: "integer" } } }, DetailPage: { type: "object", properties: { page: { type: "array", items: { type: "object" } }, isDone: { type: "boolean" }, continueCursor: { type: "string" }, consistentSnapshot: { type: "boolean", example: false }, groupBy: { type: "string" }, from: { type: "string", format: "date" }, through: { type: "string", format: "date" } } },
    LinkResponse: { type: "object", required: ["ok", "token", "ingestUrl", "snapshotUrl", "statusUrl", "revokeUrl", "profileHandle", "profileUrl"], properties: { ok: { type: "boolean" }, token: { type: "string", pattern: "^umx_[a-f0-9]{64}$", description: "Secret returned once; do not log or publish." }, ingestUrl: { type: "string", format: "uri" }, snapshotUrl: { type: "string", format: "uri" }, statusUrl: { type: "string", format: "uri", description: "Read-only credential diagnostic endpoint." }, revokeUrl: { type: "string", format: "uri" }, recommendedCliVersion: { type: "string" }, profileHandle: { type: "string" }, deviceName: { type: "string", description: "The account-side computer name, unless the CLI supplied an explicit --name override." }, profileUrl: { type: "string", format: "uri" } } },
    CollectorStatus: { type: "object", required: ["ok", "status", "credentialType", "writeOnly", "activation", "expiresAt", "scopes", "scopeStatus", "ingestAuthorized", "deviceBinding"], properties: { ok: { type: "boolean" }, status: { type: "string", enum: ["active", "revoked", "workspace_disabled", "membership_inactive", "device_mismatch", "scope_missing"] }, credentialType: { const: "collector" }, writeOnly: { const: true }, activation: { const: "not_required" }, expiresAt: { type: "null" }, scopes: { type: "array", items: { type: "string" } }, scopeStatus: { type: "string", enum: ["valid", "missing_telemetry_write"] }, ingestAuthorized: { type: "boolean" }, deviceBinding: { type: "string", enum: ["unbound", "bound", "matched", "mismatch"] }, profileHandle: { type: ["string", "null"] }, deviceName: { type: ["string", "null"] }, platform: { type: ["string", "null"] }, cliVersion: { type: ["string", "null"] }, createdAt: { type: "integer" }, lastSeenAt: { type: ["integer", "null"] }, lastSuccessAt: { type: ["integer", "null"] }, lastFailureAt: { type: ["integer", "null"] }, lastFailureCode: { type: ["string", "null"] } } },
    NativeTelemetryBatch: { type: "object", required: ["events"], additionalProperties: false, properties: { events: { type: "array", minItems: 1, maxItems: 100, items: { type: "object", required: ["eventKey", "model", "occurredAt"], additionalProperties: false, properties: {
      eventKey: { type: "string", minLength: 1, maxLength: 180 }, logicalRequestId: { type: "string", maxLength: 160 }, sessionId: { type: "string", maxLength: 160 }, agentId: { type: "string", maxLength: 160 }, agentExternalId: { type: "string", maxLength: 160 }, parentAgentId: { type: "string", maxLength: 160 }, parentAgentExternalId: { type: "string", maxLength: 160 }, agentName: { type: "string", maxLength: 80 }, eventType: { type: "string", enum: ["model_request", "tool_call", "agent_state", "outcome"] }, source: { type: "string", maxLength: 60 }, provider: { type: "string", maxLength: 60 }, requestedModel: { type: "string", maxLength: 120 }, model: { type: "string", minLength: 1, maxLength: 120 }, inputTokens: { type: "integer", minimum: 0 }, outputTokens: { type: "integer", minimum: 0 }, cacheReadTokens: { type: "integer", minimum: 0 }, cacheWriteTokens: { type: "integer", minimum: 0 }, reasoningTokens: { type: "integer", minimum: 0 }, totalTokens: { type: "integer", minimum: 0 }, costMicros: { type: "integer", minimum: 0 }, costBasis: { type: "string", enum: ["reported", "estimated", "unknown"] }, pricingSource: { type: "string", maxLength: 120 }, pricingVersion: { type: "string", maxLength: 120 }, serviceTier: { type: "string", maxLength: 40 }, region: { type: "string", maxLength: 60 }, currency: { type: "string", maxLength: 3 }, projectId: { type: "string", maxLength: 80 }, costCenter: { type: "string", maxLength: 80 }, latencyMs: { type: "integer", minimum: 0 }, timeToFirstTokenMs: { type: "integer", minimum: 0 }, status: { type: "string", enum: ["ok", "error", "cancelled"] }, state: { type: "string", maxLength: 40 }, task: { type: "string", maxLength: 180 }, traceId: { type: "string", maxLength: 64 }, spanId: { type: "string", maxLength: 32 }, occurredAt: { oneOf: [{ type: "string", format: "date-time" }, { type: "integer" }] }, schemaVersion: { type: "integer", enum: [1, 2] }, completeness: { type: "string", enum: ["reported", "estimated", "unknown"] }, accountingMode: { type: "string", enum: ["accounting", "observability"] },
    } } } } },
    OtlpPayload: { type: "object", required: ["resourceSpans"], properties: { resourceSpans: { type: "array", items: { type: "object" } } } }, SnapshotOperation: { type: "object", required: ["operation", "runId"], properties: { operation: { type: "string", enum: ["begin", "sessions", "partitions", "complete", "fail"] }, runId: { type: "string", maxLength: 80 }, mode: { type: "string", enum: ["incremental", "full", "archives"] }, sessions: { type: "array", maxItems: 100 }, partitions: { type: "array", minItems: 1, maxItems: 10 } } }, IngestResponse: { type: "object", properties: { ok: { type: "boolean" }, replay: { type: "boolean" } } }, SnapshotResponse: { type: "object", properties: { ok: { type: "boolean" }, replay: { type: "boolean" }, runId: { type: "string" }, statusUrl: { type: "string", format: "uri" }, recommendedCliVersion: { type: "string" } } }
  } }
} as const;

export default openapi;
