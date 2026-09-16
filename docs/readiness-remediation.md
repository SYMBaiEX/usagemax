# UsageMax readiness checklist

September 15, 2026. Scope: remediation of the package/platform audit against c8b5ecb.
Backend and website deployed September 15, 2026 after the owner explicitly waived hosted CI due to runner exhaustion. npm 0.3.1 was published and its registry checksum verified. This is not a capacity certification.

## Implemented and locally verified

- [x] Legacy snapshot adoption happens once; later usage advances totals.
- [x] Incomplete scans cannot subtract confirmed counters or erase missing history.
- [x] Incremental checkpoints retain history outside the current scan window.
- [x] Large source/day partitions use ordered, idempotent chunks of at most 100 rows; authoritative cleanup is bounded and protected against newer runs.
- [x] Upload journals survive interruption, preserve exact replay requests, and advance checkpoints only after completion.
- [x] Bounded retry honors Retry-After; expired runs fail explicitly and require `sync --restart`, retaining committed checkpoints.
- [x] Local configuration locks prevent simultaneous commands from overwriting upload state.
- [x] CLI 0.3.1 artifact includes the UTC-midnight timestamp correction and offline packed-artifact regression test.
- [x] Public rankings select eligible visibility/verification index branches before limiting; current profile privacy is rechecked.
- [x] Public live activity is separate from historical subscriptions and their expiry clocks.
- [x] Oversized historical detail is explicitly unavailable instead of silently reporting partial totals; bounded additive pagination is available.
- [x] Device counts update on enrollment rather than scanning every device per partition; zero-delta uploads avoid redundant rollup writes.
- [x] Enterprise summary refreshes coalesce while accounting totals remain current.
- [x] Provider dispatch is bounded to 20 active leases, with up to 10 admissions every five seconds; transient failures retry and successful pages reset the failure counter.
- [x] Staging-only snapshot load harness measures request/scenario latency, statuses and replay workloads; dry-run makes no requests.
- [x] npm publication requires full checks, package inspection and a production backend capability/version preflight.

## Verification

- 215 Vitest tests and 40 CLI tests pass (255 total), including the real ccusage parser contract and footer layout boundaries.
- ESLint, application TypeScript, separate Convex TypeScript, and production Next.js build pass.
- Published 0.3.1: 10 files, approximately 25 KB compressed; checksum 522119c9469e361ad04f0cf6ce9cfc6108ccd7be matches tested source.
- Independent review's expiry/retry findings were fixed and rechecked.
- Public render regressions use server-rendered fixtures; no claim of live browser acceptance or production scheduler verification.

## Remaining release and enterprise gates

- [ ] Hosted CI and CodeQL deferred by explicit owner approval for this release; restore when runners are available. Local checks are not hosted security scanning.
- [x] Deployed additive Convex tables, optional fields, indexes and functions to rapid-rhinoceros-943 before the web client; schema validation and index deployment succeeded.
- [x] PR #15 merged as 605f0b24f1d64e593e571226269b830ee45f833a. GitHub-triggered Vercel deployment dpl_4ZtcUn6vb6JKJS1fqDR9CHvA4suC is Ready and aliased to usagemax.com. Production CLI capability preflight passed for 0.3.1.
- [x] Published npm 0.3.1 after backend capability validation; verified registry artifact and bunx entry point.
- [x] Published 0.3.2 parser compatibility fix and verified registry artifact matches tested source (SHA-1 95a8a95108a927de4e148e07258a15b6fbdf589e). Explicit UTC since/until bounds replace the incompatible --last/--sections combination; real parser and year-boundary regressions pass.
- [x] Following explicit owner approval, live Mac sync completed at 2026-09-16T03:27:18.526Z: 10 changed rows, 131 sessions, four partitions, Codex/OpenCode, zero downward corrections. Pending journal cleared and protocol-2 checkpoint persisted. Public profile returned HTTP 200 with updated lastSyncAt and 97,384,095,403 total tokens. This verifies the existing linked Mac; it does not certify every OS/provider or new customer enrollment.
- [ ] Complete real customer invitations, SSO/SCIM, role changes, deprovisioning and provider credential/retry acceptance journeys.
- [ ] Run authorized staging capacity tests for both independent personal users and a single hot enterprise workspace. Reconcile expected totals independently after failures/replays; the harness explicitly does not certify accounting itself.
- [ ] Measure p95/p99, conflict/retry rates, provider queue lag, subscription/DB cost and collector resource usage against agreed SLOs before promising thousands of simultaneous users.
- [ ] Review historical undercounts/device-count drift via a dry-run and obtain approval for exact production corrections; this change does not infer or rewrite missing history.
- [ ] Complete product expansion: named collector contexts, managed enrollment and explicit work-only source/project/time scope. Existing team/project features do not imply automatic attribution.
- [ ] Independent security review, backup/restore drills, procurement evidence and invoice reconciliation remain acceptance work, not claims supplied by these tests.

## Deliberate safety limits

ccusage's parser result does not prove authoritative source coverage. The CLI therefore permits additions but preserves prior vectors on decreases, and does not automatically delete history. Unchanged-inventory skipping still works; it does not imply deletion authority. A future explicit reconciliation flow needs stronger coverage evidence.

Public detail pages return `consistentSnapshot:false`: concurrent corrections can change data between pages. Keep handle, group and dates fixed, follow continueCursor until isDone (including empty pages), and sum all additive contributions. This is not an immutable financial export. The UI suppresses oversized detail rather than claiming every large chart is fully aggregated.

Leaderboard hydration fails closed for stale private/deleted entries, so a branch with inconsistent legacy visibility can return fewer rows. Repairing legacy index projections requires a separate bounded migration. Public summary sentinel scans still require measured transaction-byte and subscription-cost acceptance at enterprise volumes.

Shared profile accounting remains atomic and can still contend under a hot tenant; coalesced summaries and fewer redundant writes reduce work, but do not prove sharding is unnecessary. Provider dispatch capacity is a configured upper bound, not measured throughput.

## Rollout / rollback

Use backend-first deployment, then web, then npm. Existing clients keep the combined profile contract unless they opt out of live data; chunk metadata is optional for old snapshot clients. No destructive schema migration is included.

After 0.3.1 clients begin uploads, retain the chunk-capable backend during any frontend rollback. Do not downgrade schema/functions beneath active journals. Existing uploaded counters remain protected by server receipts and stored snapshot identities. Runs expire after 30 idle days; explicit restart forces a new full scan while retaining committed local checkpoints.
