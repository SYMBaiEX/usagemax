<div align="center">
  <a href="https://usagemax.com">
    <img src="https://raw.githubusercontent.com/SYMBaiEX/usagemax/main/public/brand/icon-192.png" alt="UsageMax" width="96" height="96">
  </a>

  <h1>UsageMax</h1>

  <p><strong>Your AI work, in perspective.</strong><br>
  A private-by-default usage ledger for people and teams building with AI.</p>

  <p>
    <a href="https://usagemax.com">Live app</a> ·
    <a href="https://usagemax.com/docs">Documentation</a> ·
    <a href="https://usagemax.com/methodology">How we count</a> ·
    <a href="https://github.com/SYMBaiEX/usagemax/issues">Issues</a>
  </p>

  <p>
    <a href="https://github.com/SYMBaiEX/usagemax/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/SYMBaiEX/usagemax/ci.yml?branch=main&label=checks" alt="Checks"></a>
    <a href="https://github.com/SYMBaiEX/usagemax/actions/workflows/codeql.yml"><img src="https://img.shields.io/github/actions/workflow/status/SYMBaiEX/usagemax/codeql.yml?branch=main&label=codeql" alt="CodeQL"></a>
    <a href="https://www.npmjs.com/package/usagemax"><img src="https://img.shields.io/npm/v/usagemax?label=npm" alt="npm package"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-orange" alt="MIT license"></a>
  </p>
</div>

<p align="center">
  <img src="docs/screenshots/home.png" alt="UsageMax home page" width="960">
</p>

UsageMax brings together the AI usage histories that are already on your
computers. The web app reconciles private workspace data in Convex; the
open-source `usagemax` CLI performs bounded local scans and uploads aggregate
snapshots over the versioned API.

> UsageMax is a one-shot collector, not a resident scanner. Local files stay
> local, public sharing is opt-in, and unknown data is never invented.

## What it does

| Surface | What you get |
| --- | --- |
| Private workspace | One view across computers, providers, models, projects, and cost centers. |
| Public profile | An optional aggregate profile with activity, model mix, cost, and streaks. |
| Collector API | Installation-bound, write-only snapshots and content-free telemetry. |
| Open-source CLI | A `bunx`-friendly scanner with archive recovery and optional OS scheduling. |
| Agent surfaces | Bounded OpenAPI, MCP, Markdown, WebMCP, and agent skill documentation. |

The physical HUD/screen project is intentionally separate from this repository's
collector service. It can consume UsageMax telemetry, but it is not required to
use the platform.

## Connect a computer

### 1. Install or run the CLI

```bash
bunx usagemax@latest --help
# npm users can use: npx usagemax@latest --help
```

The CLI requires Node.js 20 or newer. Bun is recommended for local development,
but is not required to run the published package.

### 2. Create a one-use link

1. Sign in at [usagemax.com/account](https://usagemax.com/account).
2. Choose **Link a computer**, give it a name, and copy the `UMX-…` command.
3. Run the command on the computer or WSL distribution that owns the history.

```bash
bunx usagemax@latest link UMX-XXXX-XXXX-XXXX-XXXX

# Optional: override the account-side name explicitly.
bunx usagemax@latest link UMX-XXXX-XXXX-XXXX-XXXX --name "Work laptop"
```

The code expires after ten minutes and works once. Link each distinct home or
WSL distribution that contains usage history. A stable random installation ID
keeps relinking and renaming idempotent; repeating the command does not create
a duplicate device.

### 3. Reconcile usage

```bash
bunx usagemax sync --dry-run --explain  # inspect the bounded plan
bunx usagemax sync                      # upload changed usage
bunx usagemax sync --full               # reconcile all retained history
bunx usagemax status --remote           # check the stored key without printing it
```

For a first connection, the link command performs a full one-shot sync unless
you pass `--no-sync`.

## Coverage and correctness

UsageMax pins [ccusage v20.0.20](https://github.com/ccusage/ccusage/releases/tag/v20.0.20)
and uses its 16 adapters: Amp, Claude Code, Codebuff, Codex, GitHub Copilot
CLI, Factory Droid, Gemini CLI, Goose, Grok Build, Hermes, Kilo Code, Kimi CLI,
OpenClaw, OpenCode, Pi, and Qwen Code. Named Pi-format stores are discovered as
well.

The collector follows supported provider environment overrides and bounded home
locations. It also recognizes Claude Desktop sessions, `.cc-mirror`, renamed
Claude/Codex backup folders, and supported Windows homes from WSL. Normal syncs
inspect known locations and immediate home entries; they do not crawl the whole
disk.

```bash
bunx usagemax doctor                 # metadata-only coverage check
bunx usagemax doctor --deep --json   # retained-history audit
bunx usagemax sync --archives        # one-time compressed-history recovery
bunx usagemax report                 # local ccusage report
```

Full scans catalog retained history from 2024 onward. A partial or incomplete
source inventory cannot authorize destructive corrections, so decreases and
missing rows are protected until the parser can prove complete coverage.
Unknown model attribution remains `unattributed`; unknown pricing remains
unknown instead of becoming a guess.

Cursor, Windsurf, Aider, Continue, Cline, Roo Code, hosted agents, direct
provider API traffic, and enterprise billing systems do not all expose a stable
local ledger. Integrate those through the native or OTLP/HTTP JSON endpoints,
or use a provider billing export when local evidence is unavailable.

## Credentials and safe diagnostics

There is one supported write credential: a `umx_` collector token followed by
64 lowercase hexadecimal characters. It is generated server-side, shown once,
stored locally with user-only permissions, and stored by the service only as a
SHA-256 hash. Website sign-in, a link code, and a provider API key are different
credentials.

For an advanced key created in **Advanced · custom telemetry collector**, pipe
the secret through stdin. Do not put it in shell history, a URL, a request body,
or a command-line argument:

```bash
set +x
printf '%s' "$USAGEMAX_COLLECTOR_TOKEN" \
  | bunx usagemax@latest token status \
      --device-id "$USAGEMAX_INSTALLATION_ID" \
      --json \
  | jq -r '[.httpStatus, (if .ingestAuthorized then 1 else 0 end)] | @tsv'
```

The output is numeric-only: `200 1` means active and authorized, `200 0`
means the key is recognized but blocked, `409 0` means the installation does
not match, and `401 0` means the format/key was not accepted. The full command
reports scope, binding, profile, and last-write state without returning the
secret or its hash. Advanced keys are active immediately; they do not require
activation or propagation. They bind the first installation that makes a valid
write.

### Zero-token telemetry probe

The following shell-compatible `curl` probe sends exactly one content-free
`agent_state` event with zero tokens and zero cost. It prints only the HTTP
status code. Use a disposable collector if you want to test the write path:

```bash
set +x
device_id="$USAGEMAX_INSTALLATION_ID"
batch_id="${USAGEMAX_DIAGNOSTIC_BATCH_ID:-hud-diagnostic-$(date -u +%Y%m%dT%H%M%SZ)-$$}"
occurred_at="${USAGEMAX_DIAGNOSTIC_OCCURRED_AT:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"

curl -sS -o /dev/null -w '%{http_code}\n' \
  --config <(
    printf '%s\n' \
      'url = "https://usagemax.com/api/v1/telemetry/llm"' \
      'request = "POST"' \
      'header = "Authorization: Bearer '"$USAGEMAX_COLLECTOR_TOKEN"'"' \
      'header = "X-UsageMax-Device-ID: '"$device_id"'"' \
      'header = "Idempotency-Key: '"$batch_id"'"' \
      'header = "Content-Type: application/json"'
  ) \
  --data-binary @- <<JSON
{"events":[{"eventKey":"$batch_id","eventType":"agent_state","accountingMode":"observability","source":"local-hud-relay","provider":"usagemax","model":"relay-activity","inputTokens":0,"outputTokens":0,"cacheReadTokens":0,"cacheWriteTokens":0,"reasoningTokens":0,"totalTokens":0,"costMicros":0,"status":"ok","state":"diagnostic","occurredAt":"$occurred_at","schemaVersion":1,"completeness":"unknown"}]}
JSON
```

Expected result: `202` for a new batch. To replay the exact same batch, export
the two values retained by the first command before running it again in the
same shell:

```bash
export USAGEMAX_DIAGNOSTIC_BATCH_ID="$batch_id"
export USAGEMAX_DIAGNOSTIC_OCCURRED_AT="$occurred_at"
```

The replay then returns `200`. This event is not an accounting total, but it is
still persisted as observability telemetry and may bind an unbound key. The CLI
diagnostic above is the safer read-only check.

## Optional automatic checkpoints

Scheduling is off by default. When enabled, the OS invokes the same short-lived
one-shot sync; there is no resident watcher, high-frequency poller, or package
download on every run.

```bash
bun install -g usagemax
usagemax service install          # approximately every 15 minutes
usagemax service install --every 30
usagemax service status
usagemax service uninstall
```

The scheduler uses a user LaunchAgent on macOS, a user systemd timer on
Linux/WSL, and Task Scheduler on Windows. Jobs skip unchanged inventories,
back off after failures, avoid waking sleeping or battery-powered computers,
and retain only bounded local status. Use `service run` or `sync` when you want
an immediate checkpoint.

## Privacy boundary

| Stays on the computer | May be uploaded |
| --- | --- |
| Prompts and completions | Aggregate token counters |
| Source code and file contents | Provider/model and source names |
| Project paths and tool payloads | Dates, costs, coverage state |
| Provider credentials and secrets | Opaque SHA-256 session identities |

Public profiles and leaderboards are opt-in projections. Workspace data and
exports require an authenticated UsageMax session. Collector writes are
installation-bound, write-scoped, rate-limited, replay-safe, and revocable.

## Repository map

| Path | Purpose |
| --- | --- |
| `src/` | Next.js web application, public API proxy, docs, and UI |
| `convex/` | Convex schema, authorization, ingestion, projections, and jobs |
| `packages/cli/` | Published `usagemax` package |
| `docs/` | Architecture, contracts, coverage, operations, and release notes |
| `server.json` | Official MCP Registry metadata for the public remote server |
| `skills/` | Direct-installable agent skills |

Public machine-readable surfaces include the [OpenAPI document](https://usagemax.com/openapi.json),
[MCP endpoint](https://usagemax.com/mcp), [CLI guide](https://usagemax.com/cli.md),
and [authentication guide](https://usagemax.com/auth.md).

## Development

Requirements: [Bun 1.4.2](https://bun.sh/), Node.js 20 or newer, and a Convex
development deployment for the web app.

```bash
bun install
bun run check       # lint, typecheck, tests, and production build
bun run cli:pack    # verify the publishable CLI archive
```

For local web development, configure an ignored `.env.local`, then run
`bunx convex dev` and `bun run dev`. See [CONTRIBUTING.md](CONTRIBUTING.md)
for change boundaries and [docs/RELEASE.md](docs/RELEASE.md) for release gates.

## Open source

UsageMax and the CLI are released under the [MIT License](LICENSE). Third-party
dependency notices are in [NOTICE.md](NOTICE.md). Please report suspected
security issues privately through [SECURITY.md](SECURITY.md), not a public issue.
