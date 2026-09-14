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

The previous local display relay and a temporary TokenMaxxing import both observed
the same Codex logs. Counting both would inflate tokens, sessions, and leaderboards.
The imported profile and rank have been removed, the legacy importer is retired,
and UsageMax now accepts only first-party linked collectors for profile accounting.
The SYMBaiEX HUD is a separate local project and sends no display frames or
heartbeats to UsageMax.

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

## Historical comparison snapshot

At audit time TokenMaxxing reported approximately 96.49B tokens, $69.48K
API-equivalent spend, 3,740 sessions, 207 active days, a 92-day streak, four
devices, and Claude/Codex/OpenCode sources. This was used only to compare product
semantics. It is not seeded into UsageMax, does not determine a UsageMax rank, and
is not a production data source.

A local `ccusage@20.0.20` Codex calculation for 2026-09-14 confirmed the expected
shape: total tokens equaled input plus cache-read plus output in ccusage's local
schema, and reasoning was a subset of output. UsageMax's public OpenTelemetry
contract follows the OTel convention instead: input already includes cache
subsets, so total is normally input plus output. Aggregate fields that a collector
cannot break down are represented as `unclassifiedTokens` rather than mislabeled
as ordinary input.

## Corrections implemented

1. First-party linked collectors own profile, model, daily, source, and privacy-safe
   device projections. External profile snapshots cannot create rank or usage.
2. Profile totals, spend, streaks, active days, first/last dates, top model,
   sessions, devices, and sources are derived from UsageMax telemetry.
3. Seven- and thirty-day windows are inclusive 7/30 calendar-day windows rather
   than accidental 8/31-day windows.
4. Unresolved `total - output` is explicitly unclassified; cache and ordinary
   input are not fabricated from an aggregate API.
5. Cost provenance is exposed through profile, daily, model, and leaderboard
   APIs and UI labels.
6. Current OTel cache-read, cache-creation, and reasoning attribute names are
   supported; cache writes are preserved and subset metrics are not added to
   totals twice.
7. Impossible calendar dates, pre-2024 values, and distant future dates are
   rejected. This avoids malformed historical/global data entering UsageMax.
8. The local HUD is fully isolated from UsageMax accounting and networking,
   preventing duplicate Codex ingestion and rendering-driven cloud traffic.
9. Source/day and device/day projections now support public grouping. Device
   names and hostnames are never exposed; opaque collector identities become
   stable public aliases.
10. Peak day, average active-day spend, pricing version, freshness, and
    partial-sync status are first-class profile fields. Rank is computed only
    from UsageMax leaderboard projections.
11. Collector keys are created once, hashed at rest, and can be rotated or
    revoked from the authenticated account surface.
12. Telemetry batches are bounded, idempotent, and projected incrementally rather
    than rebuilding a profile in one transaction.
13. Native events preserve pricing source/version, service tier, region,
    currency, project, and cost-center context without deriving them from an
    ambiguous model name.

## Client resource audit

The desktop display relay previously rescanned active trees, reparsed unchanged
session tails, copied snapshots, and emitted cloud requests from a 100 ms loop.
It is now local-only, caches by file size/mtime, discovers sessions periodically,
and copies snapshots only on change or a low-frequency heartbeat. On the audited
Mac, its idle CPU fell from 35.1% to roughly 0.1%.

The UsageMax client is a one-shot command with zero resident idle CPU. Its normal
path first fingerprints file metadata and exits without parsing or uploading if
nothing changed. On the audited Mac, that check took about 2.7 seconds and 70 MB
maximum RSS across roughly 11,000 candidate files before path narrowing. After
limiting discovery to known session directories, it took 0.21 seconds and 40 MB
maximum RSS across about 6,000 candidate files. The prior two-day ccusage parse
took about 16.7 seconds and peaked near 1.1 GB, so it now runs only after a source
change or the daily reconciliation boundary. Historical parsing is explicit with
`bunx usagemax sync --full`.

## Pricing policy

UsageMax deliberately does not maintain a small hard-coded model-price table.
Provider pricing varies by exact model/version, cache reads and writes, prompt
length, batch/flex/priority/fast tiers, region, and negotiated enterprise rates.
A generic table would create confident but wrong spend.

The durable policy is:

- Prefer cost returned by the provider or enterprise billing export:
  `costBasis = reported`.
- For local developer-log reports, pin and record the calculator and price-data
  version: `costBasis = api-equivalent`.
- For an SDK's own calculation: `costBasis = estimated` plus a named source.
- If pricing inputs are incomplete: `costBasis = unknown`; do not infer zero.
- Reconcile estimates against provider invoices separately; never overwrite the
  immutable usage event solely to make a dashboard match a later bill.

## Remaining parity and enterprise roadmap

Priority 0 is accounting integrity; the implemented changes cover that path.
The following enterprise capabilities remain first-party UsageMax product work:

1. Add explicit source-failure and dry-run reports to the shipped one-shot CLI,
   plus optional low-frequency OS scheduling. Do not ship a high-frequency daemon.
2. Retain encrypted, access-controlled raw usage reports for parser backfills,
   with short retention and explicit opt-in; never retain prompts or code.
   The current product deliberately stores aggregates instead of pretending
   that application-level encryption without a key-management design is safe.
3. Add a user-visible reconciliation report and parser cursors beyond the current
   day-level metadata fingerprint. Freshness, rotation, and revocation are implemented.
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
