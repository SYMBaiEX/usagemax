# UsageMax security and scale review

Reviewed: 2026-09-14

## Executive assessment

No critical vulnerability or known vulnerable production dependency was found.
The application now has a sound separation of concerns: WorkOS handles identity
and sessions, while Convex validates WorkOS JWTs and owns authorization and
realtime product data. The telemetry edge uses hashed bearer credentials,
idempotency keys, bounded payloads, validation, and per-collector rate limits.

This is a strong production foundation, not a claim of formal enterprise
certification. WorkOS/Convex authentication is wired and the product now has
collector-scoped accounting and governance controls. A measured capacity test,
external monitoring, and an independent security review are still required
before publishing a numeric SLA or compliance claim.

## High-impact changes completed

- Replaced the temporary application-owned auth path with WorkOS AuthKit and
  WorkOS JWT verification in Convex.
- Added app-owned users, organization-ready workspaces, and explicit workspace
  memberships. Authentication does not imply authorization.
- Migrated identity lookup to Convex `tokenIdentifier`, with a compatibility
  fallback for existing WorkOS subject records.
- New profiles are private by default. A signed-in user cannot claim an existing
  imported profile merely by entering its handle.
- Removed internal workspace IDs, trace IDs, event hashes, and raw event records
  from public live projections.
- Added a 1 MB payload cap at both the Vercel proxy and Convex ingestion edge.
- Replaced the global ingestion counter write hotspot with 128 counter shards.
- Replaced leaderboard N+1 reads with denormalized public leaderboard rows.
- Replaced multi-thousand-row daily reads with one materialized total per day.
- Added authoritative, collector-owned source/day snapshots. Corrections and
  removed model rows apply signed deltas instead of becoming permanent overcounts.
- Scoped event, batch, session, outcome, and live-agent identity to the collector
  so two computers cannot collide by reusing a local key.
- Added append-only application audit events for profile, visibility, collector, and account
  lifecycle changes; added bounded JSON export and deletion-request recovery.
- Added an enforcing Content Security Policy, resource isolation headers,
  reduced-motion behavior, visible focus states, and chart data disclosures.
- Added CI, dependency update automation, npm OIDC trusted-publishing workflow,
  and a bounded non-production capacity probe.
- Preserved fixed query limits for live agents, events, models, leaderboard
  entries, and daily windows.
- Confirmed no known production dependency advisories with `bun audit`.

## Existing controls verified

- Collector tokens are compared by SHA-256 hash and are not stored in plaintext.
- Ingestion requires JSON, a bearer credential, and an idempotency key.
- Batches are limited to 100 events, 120 requests per minute per collector, and
  5,000 events per minute per collector.
- Event and snapshot timestamps, strings, numeric ranges, partition hashes,
  status values, and schema shape are validated before persistence.
- Public profiles are opt-in and public queries return compact projections.
- Security headers enable HTTPS transport persistence and disable framing, MIME
  sniffing, camera, microphone, geolocation, and payment access.
- No application use of `eval`, dynamic HTML injection, or browser token storage
  was found.

## Follow-up controls before enterprise GA

### Production identity verification

- Keep separate WorkOS production and non-production environments and verify
  GitHub/Google callback restrictions after each environment change.
- Keep `WORKOS_API_KEY` and `WORKOS_COOKIE_PASSWORD` only in encrypted Vercel
  environment variables; keep `WORKOS_CLIENT_ID` synchronized with Convex JWT validation.
- Enable MFA and organization policies in WorkOS, then test SSO and SCIM with a
  real pilot tenant.
- Remove obsolete auth secrets after the WorkOS cutover is verified.

### Authorization and governance

- Enforce workspace membership and permission checks in every future private
  query and mutation. Never trust a client-supplied workspace ID by itself.
- Extend append-only application audit events to membership, role, export completion, and
  retention-policy changes when those enterprise controls are enabled.
- Exercise the organization-wide emergency revoke-all control during incident-response drills.
- Define enterprise retention, deletion, export, and legal-hold workflows before
  accepting customer content beyond the current aggregate telemetry contract.

### Operations and capacity

- Load-test the ingestion path at expected events per second, burst size, and
  active subscription count. Track p50/p95/p99 latency, rejection rate, Convex
  conflicts, and Vercel function errors.
- Add error tracking, structured security logs, alerting, backup verification,
  and a tested incident-response runbook.
- Materialize the model-by-day cube if measured query bandwidth justifies it;
  current public reads query bounded calendar-day partitions without silent
  1,000/4,000-row truncation.
- Monitor the deployed retention job for raw telemetry, event and snapshot
  receipts, completed/failed snapshot runs, stale uploads, rate buckets, live
  agents, link codes, and quarantine records.
- Move from the current enforcing static CSP to a nonce-based strict CSP only
  if production profiling shows the dynamic-rendering tradeoff is acceptable.

## Scale position

The revised schema removes the clearest early scale failures: a single global
write document, N+1 leaderboard reads, workspace-scoped collector collisions,
and capped raw-row dashboard scans. It is architecturally suitable for thousands
of users when traffic is distributed across collectors and the documented limits
are enforced. That statement remains an engineering assessment, not load-test
evidence; enterprise launch is gated on the capacity and observability work above.
