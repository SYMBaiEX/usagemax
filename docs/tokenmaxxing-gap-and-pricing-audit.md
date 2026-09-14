# TokenMaxxing parity, pricing, and data audit

Audited 2026-09-14 against TokenMaxxing CLI/API release `v0.6.0`, ccusage
`v20.0.20`, the live `symbaiex` profile, and current provider documentation.

## Executive result

UsageMax must not describe every dollar amount as an invoice. TokenMaxxing runs
ccusage in calculation mode and describes cost as an API-equivalent estimate.
ccusage resolves model prices from the LiteLLM pricing dataset, applies separate
input/cache/output rates, and includes reasoning in output rather than billing
it twice. UsageMax now preserves that provenance as `api-equivalent`, preserves
provider-returned cost as `reported`, and leaves absent cost `unknown` instead
of displaying `$0` as if usage were free.

The previous local display relay and TokenMaxxing import both observed the same
Codex logs. Counting both inflated tokens, sessions, and leaderboards. Relay
events are now `observability` events: they keep the agent graph and log feed
live without changing accounting. The TokenMaxxing snapshot is authoritative
for the imported profile and corrected backfills remove stale imported rows.

## Sources of truth

- [TokenMaxxing repository and CLI contract](https://github.com/851-labs/tokenmaxxing)
- [TokenMaxxing public profile](https://tokenmaxxing.sh/symbaiex) and
  [profile API](https://api.tokenmaxxing.sh/profiles/symbaiex)
- [ccusage repository](https://github.com/ccusage/ccusage),
  [Codex guide](https://github.com/ccusage/ccusage/blob/main/docs/guide/codex/index.md),
  and [v20.0.20 release](https://github.com/ccusage/ccusage/releases/tag/v20.0.20)
- [OpenTelemetry GenAI attributes](https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/)
- Current provider pricing: [OpenAI model comparison](https://developers.openai.com/api/docs/models/compare),
  [OpenAI fast mode](https://openai.com/api-fast-mode/),
  [Google Gemini](https://ai.google.dev/gemini-api/docs/pricing), and
  [Anthropic Claude](https://docs.anthropic.com/en/docs/about-claude/pricing)

Provider pages are authoritative for current list prices. TokenMaxxing is the
behavioral benchmark. Its values are not treated as provider invoices.

## Verified TokenMaxxing behavior

- Sources: Claude Code, Codex, OpenCode, Gemini CLI, Copilot CLI, Hermes, and Pi.
- Sync is idempotent and raw daily reports are authoritative. A later corrected
  report can remove stale model rows from a covered source/day.
- `ccusage >=20.0.19` is required to avoid replayed Codex subagents inflating
  totals. TokenMaxxing currently accepts `ccusage@^20.0.19`.
- Day-level totals preserve reasoning/cache usage omitted by some model
  breakdowns. For Codex days without per-model cost, day cost is distributed to
  models by token weight. Day/profile spend remains the ccusage estimate, but
  individual model spend is therefore an allocation rather than an invoice.
- Public daily data can group by model, source, or device. Session counts are
  collected per source; source failures are surfaced by the CLI.
- The public profile exposes total tokens, API-equivalent spend, sessions,
  active days, streaks, devices, source list, peak day, top model, and rank.

## Live reconciliation snapshot

At audit time TokenMaxxing reported approximately 96.49B tokens, $69.48K
API-equivalent spend, 3,740 sessions, 207 active days, a 92-day streak, four
devices, and Claude/Codex/OpenCode sources. The API moves while local agents are
working, so deployment verification compares freshly fetched values rather than
hard-coding this snapshot.

A local `ccusage@20.0.20` Codex calculation for 2026-09-14 confirmed the expected
shape: total tokens equaled input plus cache-read plus output in ccusage's local
schema, and reasoning was a subset of output. UsageMax's public OpenTelemetry
contract follows the OTel convention instead: input already includes cache
subsets, so total is normally input plus output. Imported aggregate fields that
the public TokenMaxxing API cannot break down are stored as `unclassifiedTokens`
rather than mislabeled as ordinary input.

## Corrections implemented

1. Authoritative imports replace profile, model, and daily aggregate snapshots;
   disappeared source rows are pruned.
2. Profile totals, spend, streaks, active days, first/last dates, top model,
   sessions, devices, and sources use the source profile's authoritative fields.
3. Seven- and thirty-day windows are inclusive 7/30 calendar-day windows rather
   than accidental 8/31-day windows.
4. Imported `total - output` is explicitly unclassified; cache and ordinary
   input are not fabricated from an aggregate API.
5. Cost provenance is exposed through profile, daily, model, and leaderboard
   APIs and UI labels.
6. Current OTel cache-read, cache-creation, and reasoning attribute names are
   supported; cache writes are preserved and subset metrics are not added to
   totals twice.
7. Impossible calendar dates, pre-2024 values, and distant future dates are
   rejected. This avoids malformed historical/global data entering UsageMax.
8. Realtime display telemetry is isolated from accounting, preventing duplicate
   Codex log ingestion while retaining immediate agent activity.
9. Source/day and device/day projections now support public grouping. Device
   hostnames are salted and hashed before persistence, then exposed only as
   stable aliases.
10. Imported rank, peak day, average active-day spend, pricing version,
    freshness, and partial-sync status are first-class profile fields.
11. Collector keys are created once, hashed at rest, and can be rotated or
    revoked from the authenticated account surface.
12. Large authoritative daily projections are applied and pruned in bounded
    200-row mutations rather than deleted and rebuilt in one transaction.
13. Native events preserve pricing source/version, service tier, region,
    currency, project, and cost-center context without deriving them from an
    ambiguous model name.

## Client resource audit

The desktop display relay previously rescanned active trees, reparsed unchanged
session tails, copied snapshots, and emitted one OTLP HTTP request per event on
a 100 ms loop. It now caches by file size/mtime, discovers sessions every 30
seconds, batches up to 64 OTLP records, deduplicates cloud events locally, and
copies snapshots only on change or a 15-second heartbeat. On the audited Mac,
idle relay CPU fell from 35.1% to 0.1–0.2% while live events remained intact.

## Pricing policy

UsageMax deliberately does not maintain a small hard-coded model-price table.
Provider pricing varies by exact model/version, cache reads and writes, prompt
length, batch/flex/priority/fast tiers, region, and negotiated enterprise rates.
A generic table would create confident but wrong spend.

The durable policy is:

- Prefer cost returned by the provider or enterprise billing export:
  `costBasis = reported`.
- For local developer-log imports, pin and record the calculator and price-data
  version: `costBasis = api-equivalent`.
- For an SDK's own calculation: `costBasis = estimated` plus a named source.
- If pricing inputs are incomplete: `costBasis = unknown`; do not infer zero.
- Reconcile estimates against provider invoices separately; never overwrite the
  immutable usage event solely to make a dashboard match a later bill.

## Remaining parity and enterprise roadmap

Priority 0 is accounting integrity; the implemented changes cover that path.
The following TokenMaxxing capabilities still need first-party UsageMax product
work rather than depending on its public aggregate API:

1. Ship a native UsageMax one-shot CLI over the supported local agents, pinned
   to a tested ccusage release, with source failure status, dry-run, change
   detection, backoff, and OS scheduling. Do not ship a high-frequency daemon.
2. Retain encrypted, access-controlled raw usage reports for parser backfills,
   with short retention and explicit opt-in; never retain prompts or code.
   The current product deliberately stores aggregates instead of pretending
   that application-level encryption without a key-management design is safe.
3. Add scheduled incremental sync, cursors, source-level failure reporting, and
   a user-visible reconciliation report. Freshness, rotation, and revocation
   are implemented.
4. Add encrypted contract-rate and invoice-adjustment records plus provider
   billing reconciliation. Pricing version, service tier, region, currency,
   project, and cost-center event dimensions are implemented.
5. Add workspace budgets, anomaly alerts, team/project/cost-center allocation,
   RBAC audit logs, SSO/SCIM policy, exports, and billing-source reconciliation.
   WorkOS organization identity and allocation fields are foundations, not a
   claim that these control-plane features are finished.

TokenMaxxing's public global stats currently include malformed extreme date
values. UsageMax should keep its stricter date boundary rather than cloning that
behavior. Parity means matching useful capability and semantics, not copying a
known data-quality defect.
