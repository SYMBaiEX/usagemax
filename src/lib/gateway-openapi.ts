const authorization = [{ gatewayBearer: [] }];
const receipt = { $ref: "#/components/schemas/GatewayReceipt" };
const status = { $ref: "#/components/schemas/GatewayStatus" };
const errors = {
  "400": { description: "Invalid receipt, request ID, or report filters." },
  "401": { description: "Invalid, revoked, or inactive gateway key." },
  "403": { description: "The gateway key lacks the required scope." },
  "429": { description: "Project key rate limit reached. Retry with backoff." },
  "503": { description: "The UsageMax gateway service is unavailable." },
};
const result = (description: string, schema: object) => ({
  description,
  content: { "application/json": { schema } },
});
const itemId = { type: "string", minLength: 1, maxLength: 120, pattern: "^[A-Za-z0-9_-][A-Za-z0-9_.:-]*$" };
const slug = { type: "string", minLength: 1, maxLength: 120, pattern: "^[A-Za-z0-9][A-Za-z0-9_.:@/-]*$" };
const count = { type: "integer", minimum: 0 };
const nanoDollars = { type: ["integer", "null"], minimum: 0, description: "USD nanodollars. A null value means this amount was unavailable." };
const timestamp = { type: "integer", minimum: 0, description: "Unix epoch in milliseconds." };
const date = { type: "string", format: "date" };

export const gatewayBearer = { type: "http", scheme: "bearer", bearerFormat: "umxg_ followed by 64 lowercase hex characters" };

export const gatewayPaths = {
  "/api/v1/gateway/receipts": {
    post: {
      tags: ["Private gateway"],
      operationId: "writeGatewayReceipts",
      description: "Write settled requests to the project attached to the ingest key. Repeated revisions with identical data are idempotent. Later revisions can add evidence.",
      security: authorization,
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object", additionalProperties: false, required: ["receipts"], properties: { receipts: { type: "array", minItems: 1, maxItems: 50, items: receipt } } } } },
      },
      responses: {
        ...errors,
        "200": result("Per-receipt results.", { $ref: "#/components/schemas/GatewayWriteResult" }),
        "413": { description: "Body exceeds 64 KiB." },
        "415": { description: "Use application/json." },
      },
    },
    get: {
      tags: ["Private gateway"],
      operationId: "listGatewayReceipts",
      description: "Read a bounded slice of private settlements for the report key's project. The inclusive UTC range can cover up to 31 days.",
      security: authorization,
      parameters: [
        { name: "from", in: "query", required: true, schema: date },
        { name: "through", in: "query", required: true, schema: date },
        { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
      ],
      responses: { ...errors, "200": result("Project receipts and coverage.", { $ref: "#/components/schemas/GatewayReport" }) },
    },
  },
  "/api/v1/gateway/receipts/{requestId}": {
    get: {
      tags: ["Private gateway"],
      operationId: "getGatewayReceipt",
      description: "Read a single settlement with the project's report key.",
      security: authorization,
      parameters: [{ name: "requestId", in: "path", required: true, schema: itemId }],
      responses: {
        ...errors,
        "200": result("The latest settled request revision.", { type: "object", required: ["receipt"], properties: { receipt } }),
        "404": { description: "The request was not found in this project." },
      },
    },
  },
  "/api/v1/gateway/status": {
    get: {
      tags: ["Private gateway"],
      operationId: "getGatewayStatus",
      description: "Check connectivity and the scope of a project gateway key.",
      security: authorization,
      responses: { ...errors, "200": result("Scope and latest successful ingestion or read, where available.", status) },
    },
  },
};

export const gatewaySchemas = {
  GatewayReceipt: {
    type: "object",
    additionalProperties: false,
    required: ["schemaVersion", "requestId", "revision", "model", "provider", "status", "settledAt", "currency", "customerChargeNanos", "providerCostNanos", "providerCostBasis", "usage"],
    properties: {
      schemaVersion: { const: 1 },
      requestId: itemId,
      revision: { type: "integer", minimum: 1 },
      provider: slug,
      model: slug,
      resolvedModel: slug,
      traceId: itemId,
      status: { type: "string", enum: ["ok", "error", "cancelled"] },
      settledAt: timestamp,
      startedAt: timestamp,
      firstTokenAt: timestamp,
      stream: { type: "boolean" },
      currency: { const: "USD" },
      customerChargeNanos: nanoDollars,
      providerCostNanos: nanoDollars,
      providerCostBasis: { type: "string", enum: ["provider_reported", "invoice_confirmed", "estimated", "unknown"] },
      usage: {
        type: "object",
        additionalProperties: false,
        properties: {
          inputTokens: count,
          outputTokens: count,
          cacheReadTokens: count,
          cacheWriteTokens: count,
          reasoningTokens: count,
          reportedTotalTokens: count,
          unclassifiedTokens: count,
        },
      },
    },
  },
  GatewayStatus: {
    type: "object", required: ["ok", "scope", "lastSuccessAt"],
    properties: {
      ok: { const: true },
      scope: { type: "string", enum: ["ingest", "report"] },
      lastSuccessAt: { type: ["integer", "null"] },
    },
  },
  GatewayWriteResult: {
    type: "object", required: ["results"],
    properties: { results: {
      type: "array", items: { type: "object", required: ["requestId", "revision", "status"],
        properties: { requestId: itemId, revision: count, status: { type: "string", enum: ["accepted", "replay", "stale", "conflict"] } },
      },
    } },
  },
  GatewayReport: {
    type: "object", required: ["receipts", "truncated"],
    properties: { receipts: { type: "array", items: receipt }, truncated: { type: "boolean" } },
  },
};
