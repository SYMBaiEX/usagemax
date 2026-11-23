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
const quantiles = {
  type: ["object", "null"],
  required: ["samples", "p50", "p95", "p99"],
  properties: { samples: count, p50: count, p95: count, p99: count },
};
const metrics = { $ref: "#/components/schemas/GatewayMetrics" };
const span = { $ref: "#/components/schemas/GatewaySpan" };
const decimalNanos = { type: "string", pattern: "^-?[0-9]+$", description: "Integer USD nanodollars encoded as a string." };
const counters = [
  "requests", "errors", "cancelled", "pendingBilling", "providerAttempts", "providerErrors", "traces",
  "inputTokens", "outputTokens", "cachedTokens", "reasoningTokens", "costCovered", "marginCovered", "invoiceConfirmed",
] as const;


export const gatewayBearer = { type: "http", scheme: "bearer", bearerFormat: "umxg_ followed by 64 lowercase hex characters" };

const evalId = { type: "string", pattern: "^[a-z0-9][a-z0-9._-]{0,63}$", minLength: 1, maxLength: 64 };
const evalCount = { ...count, maximum: 1_000_000_000_000 };
const evalCaseResult = {
  type: "object", additionalProperties: false,
  required: ["caseId", "passed", "inputTokens", "outputTokens", "chargedMicrousd", "latencyMs"],
  properties: {
    caseId: evalId, passed: { type: "boolean" }, inputTokens: evalCount, outputTokens: evalCount,
    chargedMicrousd: { ...evalCount, description: "Settled customer charge in USD millionths, as submitted by the runner." },
    latencyMs: evalCount,
  },
};
const evalRoute = {
  type: "object", additionalProperties: false, required: ["id", "provider", "model", "passed", "total", "results"],
  properties: {
    id: evalId, provider: evalId, model: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$" },
    passed: { ...count, maximum: 20 }, total: { ...count, minimum: 1, maximum: 20 },
    results: { type: "array", minItems: 1, maxItems: 20, items: evalCaseResult },
  },
};

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
  "/api/v1/gateway/evals": {
    post: {
      tags: ["Private gateway"],
      operationId: "publishGatewayEvalRun",
      description: "Save a content-free eval result in the ingest key's project. Retrying identical evidence with the same run ID is idempotent. An optional baseline checks quality for matching routes and cases.",
      security: authorization,
      requestBody: {
        required: true,
        content: { "application/json": { schema: { $ref: "#/components/schemas/GatewayEvalRun" } } },
      },
      responses: {
        ...errors,
        "200": result("Stored run and its hosted quality gate, when a baseline was requested.", { $ref: "#/components/schemas/GatewayEvalReceipt" }),
        "400": { description: "Invalid eval run." },
        "404": { description: "The baseline run is absent or expired in this project." },
        "409": { description: "The run ID conflicts with stored evidence, or the baseline has a different mode, dataset, evaluator, routes, or cases." },
        "413": { description: "Body exceeds 64 KiB." },
        "415": { description: "Use application/json." },
      },
    },
  },
  "/api/v1/gateway/operations": {
    get: {
      tags: ["Private gateway"],
      operationId: "readGatewayOperations",
      description: "Read project-scoped inference analytics, recent traces and scheduled alert history. Up to 2,000 newest retained receipts are analyzed over an inclusive UTC range of up to 31 days.",
      security: authorization,
      parameters: [
        { name: "from", in: "query", required: true, schema: date },
        { name: "through", in: "query", required: true, schema: date },
      ],
      responses: { ...errors, "200": result("Gateway operations and reporting coverage.", { $ref: "#/components/schemas/GatewayOperations" }) },
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
  GatewayEvalRun: {
    type: "object", additionalProperties: false, required: ["runId", "report"],
    properties: {
      runId: evalId, baselineRunId: evalId,
      report: {
        type: "object", additionalProperties: false, required: ["mode", "dataset", "datasetVersion", "evaluator", "routes"],
        properties: {
          mode: { type: "string", enum: ["fixture", "sonnely"] },
          dataset: evalId, datasetVersion: evalId, evaluator: evalId,
          routes: { type: "array", minItems: 2, maxItems: 2, items: evalRoute },
        },
      },
    },
  },
  GatewayEvalReceipt: {
    type: "object", additionalProperties: false, required: ["runId", "status", "gate"],
    properties: {
      runId: evalId, status: { type: "string", enum: ["accepted", "replay"] },
      gate: {
        type: ["object", "null"], additionalProperties: false, required: ["passed", "regressions"],
        properties: {
          passed: { type: "boolean" },
          regressions: { type: "array", maxItems: 40, items: {
            type: "object", additionalProperties: false, required: ["routeId", "caseId"],
            properties: { routeId: evalId, caseId: evalId },
          } },
        },
      },
    },
  },
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
      trace: { type: "object", additionalProperties: false, required: ["billingStatus", "spans"], properties: {
        billingStatus: { type: "string", enum: ["final", "pending"] },
        spans: { type: "array", minItems: 1, maxItems: 12, items: span },
      } },
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
  GatewaySpan: {
    type: "object", additionalProperties: false,
    required: ["spanId", "kind", "startedAt", "endedAt", "status"],
    properties: {
      spanId: { type: "string", pattern: "^[a-f0-9]{16}$" },
      parentSpanId: { type: "string", pattern: "^[a-f0-9]{16}$" },
      kind: { type: "string", enum: ["request", "reservation", "provider", "verification", "settlement", "recovery"] },
      startedAt: timestamp, endedAt: timestamp,
      status: { type: "string", enum: ["ok", "error"] },
      httpStatus: { type: "integer", minimum: 100, maximum: 599 }, provider: slug, model: slug,
      outcome: { type: "string", enum: ["success", "http_error", "transport_error", "invalid_response", "verification_failed", "incomplete_stream"] },
    },
  },
  GatewayMetrics: {
    type: "object",
    required: ["key", ...counters, "customerChargeNanos", "knownProviderCostNanos", "coveredMarginNanos", "latency", "firstToken", "providerLatency"],
    properties: {
      ...Object.fromEntries(counters.map((name) => [name, count])),
      key: { type: "string" },
      customerChargeNanos: decimalNanos, knownProviderCostNanos: decimalNanos, coveredMarginNanos: decimalNanos,
      latency: quantiles, firstToken: quantiles, providerLatency: quantiles,
    },
  },
  GatewayOperations: {
    type: "object",
    required: ["from", "through", "retainedFromAt", "generatedAt", "latestReceiptAt", "latestRequestId", "truncated", "groupsTruncated", "limit", "overall", "recent", "daily", "providers", "models", "alerts"],
    properties: {
      from: date, through: date, retainedFromAt: timestamp, generatedAt: timestamp,
      latestReceiptAt: { type: ["integer", "null"] },
      latestRequestId: { type: ["string", "null"] },
      truncated: { type: "boolean" }, groupsTruncated: { type: "boolean" }, limit: count,
      overall: metrics,
      daily: { type: "array", items: metrics }, providers: { type: "array", items: metrics }, models: { type: "array", items: metrics },
      recent: { type: "array", items: {
        type: "object", required: ["requestId", "provider", "model", "settledAt", "status", "hasTrace"],
        properties: { requestId: itemId, provider: slug, model: slug, settledAt: timestamp,
          status: { type: "string", enum: ["ok", "error", "cancelled"] }, hasTrace: { type: "boolean" } },
      } },
      alerts: { type: "object", required: ["evaluatedAt", "truncated", "items"], properties: {
        evaluatedAt: { type: ["integer", "null"] }, truncated: { type: "boolean" },
        items: { type: "array", items: {
          type: "object", required: ["key", "rule", "provider", "samples", "observed", "openedAt", "updatedAt"],
          properties: { key: { type: "string" }, provider: slug, samples: count, observed: count,
            rule: { type: "string", enum: ["provider_errors", "slow_provider", "billing_pending"] },
            openedAt: timestamp, updatedAt: timestamp, resolvedAt: timestamp },
        } },
      } },
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
