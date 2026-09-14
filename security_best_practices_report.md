# UsageMax security and scale review

Reviewed: 2026-09-14

## Executive assessment

No critical vulnerability or known vulnerable production dependency was found.
The application now has a sound separation of concerns: WorkOS handles identity
and sessions, while Convex validates WorkOS JWTs and owns authorization and
realtime product data. The telemetry edge uses hashed bearer credentials,
idempotency keys, bounded payloads, validation, and per-collector rate limits.

This is a strong pre-production foundation, not a claim of formal enterprise
certification. Production auth remains disabled until a real WorkOS environment
is provisioned and its secrets are installed in Convex and Vercel. A capacity
test and production monitoring are still required before publishing a numeric
SLA.

## High-impact changes completed

- Replaced the temporary application-owned auth path with WorkOS AuthKit and
  WorkOS JWT verification in Convex.
- Added app-owned users, organization-ready workspaces, and explicit workspace
  memberships. Authentication does not imply authorization.
- New profiles are private by default. A signed-in user cannot claim an existing
  imported profile merely by entering its handle.
- Removed internal workspace IDs, trace IDs, event hashes, and raw event records
  from public live projections.
- Added a 1 MB payload cap at both the Vercel proxy and Convex ingestion edge.
- Replaced the global ingestion counter write hotspot with 128 counter shards.
- Replaced leaderboard N+1 reads with denormalized public leaderboard rows.
- Replaced multi-thousand-row daily reads with one materialized total per day.
- Throttled leaderboard rewrites to at most once per minute per profile entry.
- Preserved fixed query limits for live agents, events, models, leaderboard
  entries, and daily windows.
- Confirmed no known production dependency advisories with `bun audit`.

## Existing controls verified

- Collector tokens are compared by SHA-256 hash and are not stored in plaintext.
- Ingestion requires JSON, a bearer credential, and an idempotency key.
- Batches are limited to 100 events, 120 requests per minute per collector, and
  5,000 events per minute per collector.
- Event timestamps, strings, numeric ranges, status values, and schema shape are
  validated before persistence.
- Public profiles are opt-in and public queries return compact projections.
- Security headers enable HTTPS transport persistence and disable framing, MIME
  sniffing, camera, microphone, geolocation, and payment access.
- No application use of `eval`, dynamic HTML injection, or browser token storage
  was found.

## Follow-up controls before enterprise GA

### Production activation

- Provision separate WorkOS production and non-production environments.
- Configure a production GitHub OAuth application in WorkOS and restrict its
  redirect URI to `https://usagemax.com/callback`.
- Store `WORKOS_API_KEY` and `WORKOS_COOKIE_PASSWORD` only in encrypted Vercel
  environment variables; set `WORKOS_CLIENT_ID` in Convex for JWT validation.
- Enable MFA and organization policies in WorkOS, then test SSO and SCIM with a
  real pilot tenant.
- Remove obsolete auth secrets after the WorkOS cutover is verified.

### Authorization and governance

- Enforce workspace membership and permission checks in every future private
  query and mutation. Never trust a client-supplied workspace ID by itself.
- Add immutable audit events for membership, role, collector, visibility,
  export, and retention-policy changes.
- Add collector rotation, last-used visibility, scoped credentials, and an
  emergency revoke-all control.
- Define enterprise retention, deletion, export, and legal-hold workflows before
  accepting customer content beyond the current aggregate telemetry contract.

### Operations and capacity

- Load-test the ingestion path at expected events per second, burst size, and
  active subscription count. Track p50/p95/p99 latency, rejection rate, Convex
  conflicts, and Vercel function errors.
- Add error tracking, structured security logs, alerting, backup verification,
  and a tested incident-response runbook.
- Materialize the model-by-day cube if a single profile approaches the current
  2,500-row bounded model-history read.
- Add retention jobs for raw telemetry, receipts, rate buckets, and quarantine
  records.
- Add an enforcing nonce-based Content Security Policy after AuthKit and Next.js
  script requirements are verified in production. The current header set does
  not yet include CSP.

## Scale position

The revised schema removes the two clearest early scale failures: a single
global write document and N+1 leaderboard reads. It is architecturally suitable
for thousands of users, provided telemetry is distributed across collectors and
the documented limits are enforced. That statement is an engineering readiness
assessment, not load-test evidence; enterprise launch should remain gated on the
capacity and observability work above.
