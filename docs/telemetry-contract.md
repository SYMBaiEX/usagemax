# UsageMax telemetry contracts

UsageMax has two deliberately separate ingestion paths:

- **Snapshot v2** is the recommended path for local coding-agent history. It is
  authoritative, correction-aware, and optimized for a short-lived CLI run.
- **Event v2** records live model attempts, tool calls, agent state, and outcomes.

Neither path accepts prompts, completions, files, or tool payloads.

## Authoritative snapshot endpoint

`POST https://usagemax.com/api/v2/usage/snapshots` accepts a small operation
envelope. The link response supplies the exact `snapshotUrl`; clients must not
derive it or depend on an infrastructure-provider hostname.

A run follows this sequence:

1. `begin` declares a UUID `runId`, mode, source inventory, partition count, and
   coverage bounds.
2. `sessions` uploads opaque, installation-scoped session hashes in chunks of
   at most 100. Local paths and raw session identifiers never leave the device.
3. `partitions` uploads at most 10 complete source/day partitions per request,
   with at most 100 provider/model rows per partition.
4. `complete` atomically publishes coverage and leaderboard metadata only after
   every declared partition has been accepted. `fail` records a bounded error
   code without advancing the local checkpoint.

The canonical row identity is:

`collector + source + UTC day + provider + model`

Each partition carries a monotonically increasing revision, a stable
`partitionId`, and a server-recomputed payload hash. Replaying the same payload
is safe. Reusing an idempotency key for different content is rejected. A
complete partition removes rows that disappeared locally; signed server-side
diffs therefore handle corrected and deleted history instead of permanently
inflating totals.

Snapshot token buckets mirror ccusage's disjoint local accounting categories:
input, output, cache read, cache write, reasoning, and unclassified. Their exact
sum must equal `totalTokens`. Aggregate reports do not fabricate request counts.
Unknown pricing remains explicitly unknown and contributes no guessed cost.

The official CLI performs a one-shot scan and exits. It does not install a
resident filesystem watcher. A first sync, explicit `--full` sync, or inventory
revision can catalog history back to 2024; normal runs send only changed
partitions.

## Event endpoint

UsageMax records one normalized event per provider attempt. Retries share a
`logicalRequestId` but must have distinct `eventKey` values. Every HTTP batch also
requires an `Idempotency-Key`; replaying an identical batch is safe, while reusing
the key for different data returns `409`.

### Native endpoint

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

One request accepts 1–100 events and at most 1 MB of JSON. Across event and
snapshot APIs, each collector is limited to 180 operations and 20,000 accepted
items per minute, with bounded burst capacity. Timestamps before 2024 or more
than five minutes in the future are rejected.

For event schema v2, token categories follow the current OpenTelemetry GenAI convention:

- `inputTokens` includes every input token, including cache reads and writes.
- `cacheReadTokens` and `cacheWriteTokens` are informational subsets of input.
- `reasoningTokens` is an informational subset of output.
- `totalTokens` is therefore normally `inputTokens + outputTokens`, not the sum
  of every field. Send `totalTokens` explicitly when a provider defines it
  differently.

Public accounting projections convert event counters to **disjoint** buckets:
cache reads/writes are removed from input, and reasoning is removed from output.
The original provider counters remain unchanged on each raw event. If a source's
reported total contradicts its categories, the total is preserved as unclassified
rather than inventing a split. Legacy ccusage aggregate events retain their
explicit disjoint-input convention. Native events default to schema v2; the
legacy aggregate signature or an explicit schema v1 selects the old convention.

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

### OTLP endpoint

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
The public API location and client source are not secrets. Each installation
receives a random 256-bit, write-only collector credential that is shown once,
stored only in that installation's user-private config, bound to its stable
installation identity, rate-limited, and independently revocable. UsageMax does
not place shared backend credentials in the CLI or browser bundle.
Imported device names are salted and hashed before persistence. Public grouped
data uses stable labels such as `Device 1`; hostnames never enter the public
projection.
