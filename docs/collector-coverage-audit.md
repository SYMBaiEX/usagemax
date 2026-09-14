# UsageMax collector coverage audit

_Verified September 14, 2026 against the published `usagemax` collector and
`ccusage@20.0.20`._

## Executive finding

UsageMax has two complementary ingestion layers:

1. The one-shot CLI imports every aggregate source supported by the pinned
   [ccusage v20.0.20 release](https://github.com/ccusage/ccusage/blob/v20.0.20/apps/ccusage/README.md#supported-sources).
2. Native JSON and OTLP/HTTP ingest cover model calls made through SDKs, hosted
   agents, proxies, and tools that do not expose a dependable local ledger.

No local collector can recover logs that were deleted, never persisted, or
retained only by a provider. Full coverage therefore means linking every local
operating-system environment and instrumenting or importing every non-local
request path. UsageMax reports gaps instead of estimating missing activity.

## Local adapters shipped in v0.2

| Source | Default data location or signal | Notable override |
|---|---|---|
| Amp | `~/.local/share/amp/threads` | `AMP_DATA_DIR` |
| Claude Code | XDG Claude and `~/.claude/projects` | `CLAUDE_CONFIG_DIR` |
| Codebuff | `~/.config/manicode*/projects` | `CODEBUFF_DATA_DIR` |
| Codex | `~/.codex/sessions` and archived sessions | `CODEX_HOME` |
| GitHub Copilot CLI | `~/.copilot/otel` | `COPILOT_OTEL_FILE_EXPORTER_PATH` |
| Factory Droid | `~/.factory/sessions` | `DROID_SESSIONS_DIR` |
| Gemini CLI | `~/.gemini/tmp` | `GEMINI_DATA_DIR` |
| Goose | Linux, macOS, and Windows session databases | `GOOSE_PATH_ROOT` |
| Grok Build | `~/.grok/sessions` | `GROK_HOME` |
| Hermes | `~/.hermes/state.db` plus WAL state | `HERMES_HOME` |
| Kilo Code | `~/.local/share/kilo/kilo.db` plus WAL state | `KILO_DATA_DIR` |
| Kimi CLI | `~/.kimi*/sessions` | `KIMI_DATA_DIR` |
| OpenClaw | current and legacy OpenClaw homes | `OPENCLAW_DIR` |
| OpenCode | `~/.local/share/opencode` | `OPENCODE_DATA_DIR` |
| Pi | `~/.pi/agent/sessions` and named compatible stores | `PI_AGENT_DIR` |
| Qwen Code | `~/.qwen/projects` | `QWEN_DATA_DIR` |

The inventory deliberately mirrors the pinned parser rather than claiming
support for unreleased adapters. Antigravity and ZCode exist on ccusage's current
development branch but were not present in the latest npm release during this
audit. They should be adopted only after a tagged release and fixture validation.

## Cross-device collection model

Each distinct home directory is a collector environment:

```text
UsageMax account
  ├─ Mac home
  ├─ ai-desktop Windows home
  ├─ ai-desktop WSL home
  ├─ ai-laptop Windows home
  └─ any additional WSL distro, VM, container, or server home
```

Run `bunx usagemax@latest link ...` once in each environment, using a fresh
one-time code for each. Windows and WSL are intentionally separate because their
agent stores are separate. All collectors write into one profile.

A private random installation ID survives relinking and display-name changes,
so rerunning the CLI on one installation does not create a second device. The ID
is not derived from hardware and the server stores only its hash. Different
installations are counted separately. Two installations pointed at the same
copied or network-mounted logs can still overlap; automatically deciding whether
identical aggregates represent copied history or two real requests is not safe.

## Correctness changes in v0.2

- The source inventory expanded from seven partial path checks to all 16 pinned
  adapters, including SQLite WAL files, ccusage config, model aliases, named Pi
  stores, XDG Claude data, Copilot OTel exports, and Windows Goose storage.
- Inventory traversal is deterministic. An unreadable or truncated inventory
  disables the no-change shortcut instead of risking a missed sync.
- New adapters, parser/inventory revisions, and a seven-day boundary trigger a
  full reconciliation automatically. Ordinary unchanged runs remain a cheap
  metadata check with no parsing and no network request.
- A sync is marked complete only after every batch succeeds. A failed later batch
  cannot publish a success fingerprint that suppresses its retry.
- Day/source totals that exceed per-model breakdowns are preserved in an
  `unattributed` row and in `unclassifiedTokens`; they are no longer discarded.
- Provider labels recognize common routed model prefixes, while the original
  model string remains intact.

The current incremental protocol uses monotonic local high-water marks. It is
safe for repeated unchanged runs and ordinary additive history, but it does not
yet perform authoritative replacement when a parser later reduces or removes a
historical row. Server-owned source/day snapshots are the next accounting
protocol upgrade and are required before claiming invoice-grade correction
semantics.

## Sources that need more than local ccusage

| Source class | Current dependable path | Why local discovery alone is insufficient |
|---|---|---|
| Cursor teams | Cursor Admin API import | The official API exposes usage/model data; a stable local IDE billing ledger is not documented. |
| Cline | OpenTelemetry export | Cline documents model, token, cache, and cost telemetry for monitoring. |
| Roo Code | OTel or a validated history adapter | Persisted task history exists, but model attribution and schema stability require fixtures before first-party support. |
| Continue | Validated `tokensGenerated.jsonl` adapter or OTel | Continue records development telemetry, but some values may be estimated and the schema is not a billing contract. |
| Aider | Explicit analytics/token log | Aider's optional analytics log must be enabled; transcripts alone are not a dependable token ledger. |
| Windsurf | Future validated adapter or organization export | Local history exists, but an exact stable token/cost ledger was not established in official documentation. |
| Direct provider SDKs | UsageMax native SDK/JSON or OTel | Requests may never pass through a coding-agent local store. |
| Hosted agents and gateways | OTel, gateway logs, or billing export | The activity occurs outside the user's local filesystem. |
| Enterprise invoices | Provider billing connector | Negotiated rates, credits, tiers, and adjustments cannot be reconstructed from token logs. |

Primary integration references:

- [Cursor Admin API](https://prod.cursor.com/docs/account/teams/admin-api)
- [Cline OpenTelemetry events](https://docs.cline.bot/enterprise-solutions/monitoring/opentelemetry-events)
- [Continue development data guide](https://github.com/continuedev/continue/blob/main/.continue/rules/dev-data-guide.md)
- [Aider analytics](https://aider.chat/docs/more/analytics.html)
- [Windsurf local history](https://docs.devin.ai/desktop/troubleshooting/windsurf-common-issues)
- [Roo Code persisted history types](https://github.com/RooCodeInc/Roo-Code/blob/main/packages/types/src/history.ts)
- [OpenTelemetry GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/)

## Provider and model fidelity

The CLI uploads every model row emitted by the pinned parser and retains its
original model name. A provider label can be inferred from a model or gateway
prefix, but a local aggregate does not always identify the actual serving
provider. For example, the same model can be routed through OpenRouter, Azure,
Bedrock, Vertex AI, or an enterprise gateway.

Invoice-grade provider attribution therefore requires request telemetry or a
billing export carrying provider, requested model, response model, service tier,
region, project, cost center, currency, and reported cost. UsageMax's native and
OTLP contracts already accept those dimensions; the local CLI marks its ccusage
cost as estimated/API-equivalent rather than pretending it is an invoice.

## Resource policy

- No resident UsageMax daemon is required.
- Unchanged runs use a metadata-only inventory and avoid both parser startup and
  the network.
- Changed runs normally parse one or two UTC days.
- Full retained history is reconciled on first link, when coverage changes, when
  a new source appears, on explicit `sync --full`, and at most once per seven days.
- The parser runs offline with cached pricing data, so collection never needs
  provider credentials.
- Prompts, completions, source code, file contents, and project paths are not sent.

## Operator checklist

On every Mac, Windows host, WSL distro, VM, or server that has usage:

```bash
bunx usagemax@latest doctor
bunx usagemax@latest status
bunx usagemax@latest sync --full
```

Use `doctor --deep` only when validating coverage; it intentionally parses all
retained history. Compare its parsed source list with the tools actually used on
that environment. Then instrument direct APIs and unsupported applications with
OTLP/native ingestion. The profile is complete only when both layers are covered.
