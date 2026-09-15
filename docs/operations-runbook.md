# UsageMax operations runbook

## Service boundaries

- WorkOS owns user authentication, session rotation, OAuth, SSO, and organization identity.
- Convex owns authorization, hashed collector credentials, authoritative usage snapshots, recent telemetry, projections, and realtime subscriptions.
- Vercel serves the Next.js product and the stable `usagemax.com/api` facade. Public clients never depend on a deployment-provider hostname.
- The npm collector is one-shot. It is not a resident daemon and does not send a network request when its source fingerprint is unchanged.

## WorkOS organization lifecycle

Configure a WorkOS webhook at `https://usagemax.com/api/webhooks/workos` for:

- `organization.updated`
- `organization.deleted`
- `organization_membership.created`
- `organization_membership.updated`
- `organization_membership.deleted`

Set `WORKOS_CLIENT_ID` and the endpoint-specific `WORKOS_WEBHOOK_SECRET` on the
production Convex deployment. Requests are signature- and timestamp-verified in
Convex before any state change. Event IDs are deduplicated for 90 days and each
membership keeps the latest authorization-change timestamp, so retries and
out-of-order delivery cannot restore stale access. Privileged operations reject
JWTs issued before a membership authorization change and require session refresh.

After configuration, exercise active → inactive → active membership transitions,
an organization deletion in a disposable tenant, a replayed event, an invalid
signature, and an older event delivered after a newer event. Retain the event IDs
and UsageMax audit rows as deployment evidence; never retain payload bodies.

## Release gates

1. `bun install --frozen-lockfile`
2. `bun run check`
3. `bun run cli:pack`
4. Deploy Convex additive schema/functions before the web app and CLI.
5. Verify `/health`, `/api/health`, sign-in/callback, a private account, a public profile, and one new collector reconciliation.
6. Verify the WorkOS webhook endpoint with a signed test event when lifecycle configuration changed.
7. Publish the CLI only through npm trusted publishing with provenance.

## Alerts

Alert on sustained HTTP 5xx, authentication failure spikes, snapshot conflicts,
projection underflow, rate-limit saturation, failed snapshot runs, and stale
production deployments. Never include collector tokens, OAuth codes, prompts,
paths, or event payloads in alert text.

Use Vercel WAF rate limits on `/api/v1/devices/link`, `/api/v1/telemetry/llm`,
`/api/v1/traces`, and `/api/v2/usage/snapshots` for IP-level abuse control.
Convex independently enforces transactional per-collector request and item
budgets, so bypassing or discovering the facade does not bypass authorization.

## Ingestion incident

1. Confirm whether failures affect native events, snapshots, or both.
2. Keep collectors one-shot; do not advise tight retry loops.
3. For snapshot conflicts, preserve the failed run and receipt evidence. Do not manually add deltas.
4. For projection underflow, stop the affected collector and run a reviewed reconciliation against its authoritative snapshot rows.
5. If credentials may be exposed, revoke the collector. Existing totals remain.
6. Publish impact using counts and time windows, never customer content.

## Capacity test

Use a dedicated non-production workspace and collector:

```bash
USAGEMAX_LOADTEST_URL=https://example.test/v1/telemetry/llm \
USAGEMAX_LOADTEST_TOKEN=umx_dedicated_test_key \
USAGEMAX_LOADTEST_REQUESTS=1000 \
USAGEMAX_LOADTEST_CONCURRENCY=10 \
bun run loadtest:ingest
```

Record p50/p95/p99 latency, status distribution, Convex conflicts, function
execution time, database bandwidth, and subscription lag. This script defaults
to 100 observability-only events and caps concurrency at 25 so an accidental run
cannot become an unbounded traffic generator.

## Recovery

- A lost snapshot response is replay-safe through collector-scoped partition receipts.
- A failed run may have committed complete source/day partitions; retrying a new run compares against server-owned snapshots and does not duplicate them.
- Raw telemetry expires independently of authoritative accounting snapshots.
- Restore projections from collector snapshots and retained non-expired request events; do not treat local CLI checkpoints as server authority.

## Account deletion

- A confirmed deletion immediately revokes workspace collectors and starts a seven-day recovery window.
- Cancellation restores only collectors revoked by that specific request.
- At expiry, a bounded, resumable Convex job makes the profile private first, then removes public rows, telemetry, projections, snapshots, collector credentials, audit records, membership, profile, workspace, and the otherwise-unreferenced app user.
- The daily recovery cron resumes interrupted jobs. Anonymous network-level counters remain as non-identifying service statistics.
