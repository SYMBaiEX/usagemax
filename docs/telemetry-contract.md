# UsageMax telemetry contract v1

UsageMax records one normalized event per provider attempt. Retries share a
`logicalRequestId` but must have distinct `eventKey` values. Every HTTP batch also
requires an `Idempotency-Key`; replaying an identical batch is safe, while reusing
the key for different data returns `409`.

## Native endpoint

`POST /api/v1/telemetry/llm`

Required event fields:

- `eventKey`: stable source identifier, maximum 180 characters
- `model`: resolved model name
- `occurredAt`: ISO timestamp or Unix milliseconds

Useful optional fields:

- `eventType`: `model_request`, `tool_call`, `agent_state`, or `outcome`
- `logicalRequestId`, `sessionId`, `agentId`, `parentAgentId`, `agentName`
- `source`, `provider`, `requestedModel`
- `inputTokens`, `outputTokens`, `cacheReadTokens`, `reasoningTokens`, `totalTokens`
- `costMicros`, `latencyMs`, `timeToFirstTokenMs`
- `status`: `ok`, `error`, or `cancelled`
- `state`, `task`, `traceId`, `spanId`
- `completeness`: `reported`, `estimated`, or `unknown`

One request accepts 1–100 events and at most 1 MB of JSON. Collector limits are
120 requests and 5,000 events per minute. Timestamps before 2024 or more than five
minutes in the future are rejected.

## OTLP endpoint

`POST /api/v1/traces` accepts OTLP/HTTP JSON `resourceSpans`. UsageMax maps the
OpenTelemetry GenAI semantic attributes into the native content-free contract.
OTLP protobuf and gzip belong in the planned collector gateway rather than the
MVP Convex HTTP action.

## Privacy boundary

The allowlist intentionally excludes prompts, completions, source code, file
paths, tool arguments, tool output, environment variables, and free-form OTLP
attributes. API keys are SHA-256 hashed before storage. Public profiles are
separate from workspace telemetry and are designed to be opt-in.
