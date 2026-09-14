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
- `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `reasoningTokens`, `totalTokens`
- `costMicros`, `latencyMs`, `timeToFirstTokenMs`
- `costBasis`: `reported`, `estimated`, or `unknown`
- `pricingSource`, `pricingVersion`, `serviceTier`, `region`, `currency`
- `projectId`, `costCenter` for private allocation and future chargeback
- `status`: `ok`, `error`, or `cancelled`
- `state`, `task`, `traceId`, `spanId`
- `completeness`: `reported`, `estimated`, or `unknown`

One request accepts 1–100 events and at most 1 MB of JSON. Collector limits are
120 requests and 5,000 events per minute. Timestamps before 2024 or more than five
minutes in the future are rejected.

Token categories follow the current OpenTelemetry GenAI convention:

- `inputTokens` includes every input token, including cache reads and writes.
- `cacheReadTokens` and `cacheWriteTokens` are informational subsets of input.
- `reasoningTokens` is an informational subset of output.
- `totalTokens` is therefore normally `inputTokens + outputTokens`, not the sum
  of every field. Send `totalTokens` explicitly when a provider defines it
  differently.

`costMicros` is only meaningful together with `costBasis`. An omitted cost is
stored as unknown, never silently treated as free usage. A provider-returned
zero is still `reported`; a locally calculated amount is `estimated`.
`pricingSource` and `pricingVersion` identify the calculator or billing export;
`serviceTier`, `region`, and `currency` preserve modifiers that can materially
change the amount. UsageMax does not guess these fields from a model nickname.

Only `model_request` events update token and spend accounting. `tool_call`,
`agent_state`, and `outcome` events may feed bounded enterprise telemetry without
changing profile totals, sessions, spend, or leaderboards. Display frames and
animation heartbeats are not part of this API.

## OTLP endpoint

`POST /api/v1/traces` accepts OTLP/HTTP JSON `resourceSpans`. UsageMax maps the
OpenTelemetry GenAI semantic attributes into the native content-free contract,
including `gen_ai.usage.cache_read.input_tokens`,
`gen_ai.usage.cache_creation.input_tokens`, and
`gen_ai.usage.reasoning.output_tokens`. Deprecated UsageMax aliases remain
accepted during migration.
Pricing context is accepted from `gen_ai.usage.cost.source`,
`gen_ai.usage.cost.version`, `gen_ai.request.service_tier`, `cloud.region`, and
`gen_ai.usage.cost.currency`; UsageMax-specific aliases are also supported.
OTLP protobuf and gzip belong in the planned collector gateway rather than the
MVP Convex HTTP action.

## Privacy boundary

The allowlist intentionally excludes prompts, completions, source code, file
paths, tool arguments, tool output, environment variables, and free-form OTLP
attributes. API keys are SHA-256 hashed before storage. Public profiles are
separate from workspace telemetry and are designed to be opt-in.
Imported device names are salted and hashed before persistence. Public grouped
data uses stable labels such as `Device 1`; hostnames never enter the public
projection.
