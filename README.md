# UsageMax

UsageMax is a privacy-first AI usage network: public work profiles and leaderboards
for individuals, plus realtime cost, agent, outcome, and governance telemetry for teams.

The application uses Next.js 16 on Vercel and Convex for the database, functions,
HTTP ingestion, materialized rollups, leaderboards, and realtime subscriptions.
There is no Postgres dependency.

## Local development

```bash
bun install
bunx convex dev
bun run dev
```

The Vercel Marketplace Convex integration supplies `CONVEX_DEPLOY_KEY`,
`NEXT_PUBLIC_CONVEX_URL`, and `NEXT_PUBLIC_CONVEX_SITE_URL`.

## Verification

```bash
bun run check
```

## Ingestion

Native normalized events:

```bash
curl https://usagemax.com/api/v1/telemetry/llm \
  -H "Authorization: Bearer $USAGEMAX_COLLECTOR_TOKEN" \
  -H "Idempotency-Key: example-batch-1" \
  -H "Content-Type: application/json" \
  --data '{"schemaVersion":1,"events":[{"eventKey":"request-1","eventType":"model_request","provider":"openai","model":"gpt-5.6-sol","inputTokens":1200,"outputTokens":240,"totalTokens":1440,"costMicros":8200,"status":"ok","occurredAt":"2026-09-13T12:00:00Z"}]}'
```

OTLP/HTTP JSON traces are accepted at `/api/v1/traces`. Prompts, completions,
source code, file paths, and arbitrary span attributes are not retained.

See [the research and roadmap](docs/research-and-roadmap.md) and
[the telemetry contract](docs/telemetry-contract.md).
