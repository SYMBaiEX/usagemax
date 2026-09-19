# UsageMax CLI

Connect the AI usage history on a computer to one private UsageMax workspace.
The CLI is deliberately short-lived: it scans locally, uploads bounded
aggregates, and exits.

[UsageMax](https://usagemax.com) · [Account](https://usagemax.com/account) ·
[CLI documentation](https://usagemax.com/cli.md) ·
[API contract](https://usagemax.com/openapi.json) ·
[npm package](https://www.npmjs.com/package/usagemax) ·
[source repository](https://github.com/SYMBaiEX/usagemax/tree/main/packages/cli)

This package is the open-source `usagemax` command-line collector. It is not a
JavaScript or Python SDK and does not expose an import API. For programmatic
integrations, use the documented [OpenAPI contract](https://usagemax.com/openapi.json)
or the public [agent surfaces](https://usagemax.com/?mode=agent); the package
itself is intended to be invoked as a short-lived local process.

See the repository's [SDK and integration surface](../../docs/sdk-ecosystem.md)
for the supported client matrix. UsageMax does not advertise Python or Go
packages until they are separately reviewed and published.

## Requirements

- Node.js 20 or newer
- Bun or npm
- A UsageMax account and one link code per computer or WSL distribution

## Quick start

```bash
# Create a one-use code at https://usagemax.com/account.
bunx usagemax@latest link UMX-XXXX-XXXX-XXXX-XXXX

# npm users can run the same one-shot command with npx.
npx --yes usagemax@latest link UMX-XXXX-XXXX-XXXX-XXXX

# Preview, then upload changed local usage.
bunx usagemax sync --dry-run --explain
bunx usagemax sync
```

Agent-friendly checks can request JSON and keep the secret out of arguments and
logs. This example only inspects local source coverage:

```bash
set +x
bunx usagemax doctor --deep --json | jq '{complete, sources: [.sources[] | {name, status}]}'
```

The JSON shape is intended for local automation; unsupported or unavailable
sources remain explicitly reported rather than being inferred.

The link code expires after ten minutes and is consumed once. The account-side
computer name is retained. Pass `--name "Work laptop"` only when the current
CLI should explicitly override it.

Each installation gets a stable random ID and a new write-only collector key.
Relinking or renaming that installation rotates the key without creating a
second device. Do not link two installations to the same copied or
network-mounted log tree; cross-installation duplicate history is ambiguous.

## Commands

```text
usagemax                         Sync changed local usage
usagemax link <code> [options]   Link and sync a computer
usagemax sync [options]          Reconcile local usage once
usagemax status                  Show local link state
usagemax doctor                  Check discovered sources
usagemax report [ccusage args]   Run a local ccusage report
usagemax token status            Diagnose a key piped on stdin
usagemax service install        Opt into periodic OS checkpoints
usagemax service status|run|uninstall
usagemax unlink [--revoke]       Remove local credentials
```

Useful options:

```bash
bunx usagemax sync --full                 # all retained local history
bunx usagemax sync --archives             # one-time compressed-history recovery
bunx usagemax sync --restart              # restart an expired saved upload
bunx usagemax status --remote --json      # remote check; secret is never printed
bunx usagemax doctor --deep --json        # parse and audit retained history
bunx usagemax link UMX-… --no-sync        # link without uploading yet
```

## Sources and coverage

UsageMax pins [ccusage v20.0.20](https://github.com/ccusage/ccusage/releases/tag/v20.0.20)
and supports its 16 adapters: Amp, Claude Code, Codebuff, Codex, GitHub Copilot
CLI, Factory Droid, Gemini CLI, Goose, Grok Build, Hermes, Kilo Code, Kimi CLI,
OpenClaw, OpenCode, Pi, and Qwen Code. Named Pi-format stores are discovered as
well.

The collector follows the supported provider environment overrides and bounded
home locations. It recognizes Claude Desktop sessions, `.cc-mirror`, renamed
Claude/Codex backup folders, and supported Windows homes from WSL. In WSL, use
one collector for the Windows provider homes it can read instead of linking the
same history again from Windows.

Full scans catalog retained history from 2024 onward. `sync --archives` safely
extracts supported Claude JSONL members into a private temporary directory and
removes them after reconciliation. Normal runs do not crawl the whole disk or
unpack archives.

Cursor, Windsurf, Aider, Continue, Cline, Roo Code, hosted agents, and direct
provider API traffic may not leave a stable local token ledger. Use UsageMax's
native or OTLP/HTTP JSON contract, or a provider billing export, when local
evidence is unavailable. Unsupported usage is never guessed.

## Safe collector diagnostics

An advanced key from **Advanced · custom telemetry collector** is a
`umx_` prefix followed by 64 lowercase hexadecimal characters. Pipe it through
stdin; never pass it as an argument or put it in a URL:

```bash
set +x
printf '%s' "$USAGEMAX_COLLECTOR_TOKEN" \
  | bunx usagemax@latest token status \
      --device-id "$USAGEMAX_INSTALLATION_ID" \
      --json
```

The `token status` command is included in CLI `0.3.6`. If the public npm tag
does not yet contain `0.3.6`, run `node packages/cli/src/cli.js token status`
from the UsageMax repository until that release is published.

The response is read-only and contains only status, type, scopes, profile/name,
activation state, and a binding result of `unbound`, `bound`, `matched`, or
`mismatch`. It never returns the token, hash, or raw authorized UUID.

For a numeric-only result suitable for a smoke check:

```bash
set +x
printf '%s' "$USAGEMAX_COLLECTOR_TOKEN" \
  | bunx usagemax@latest token status \
      --device-id "$USAGEMAX_INSTALLATION_ID" --json \
  | jq -r '[.httpStatus, (if .ingestAuthorized then 1 else 0 end)] | @tsv'
```

`200 1` is active and ingestion-authorized. `200 0` is recognized but blocked;
inspect `status` and `scopeStatus` in the unfiltered JSON. `409 0` is a device
binding mismatch. `401 0` means the format/key was rejected.

New advanced keys are active immediately and need no activation or propagation.
They bind on their first valid write. Linked CLI keys are bound during the link
exchange. A `401` means the key format is invalid or the key is unknown,
revoked, disabled, or from another deployment. A `409` means the supplied
installation does not match. A recognized key missing `telemetry:write` has
`status: scope_missing`, `scopeStatus: missing_telemetry_write`, and
`ingestAuthorized: false`.

For a write-path smoke check, the root README includes a `curl` request that
sends one `agent_state` event with all token counters and `costMicros` set to
zero. It is observability-only: `agent_state` does not update accounting, and
the probe may bind an otherwise unbound advanced key.

## Privacy and resource use

The CLI uploads aggregate token counters, provider/model names, source names,
dates, cost provenance, coverage state, and opaque SHA-256 session identities.
It never uploads prompts, completions, source code, file contents, project
paths, tool payloads, or provider credentials.

Every sync is one-shot. A complete unchanged inventory can skip parsing and
uploading; date rollover, new sources, a weekly reconciliation, `--full`, or
`--archives` triggers the appropriate bounded scan. Decreases and deletions are
protected while coverage is incomplete.

Optional scheduling invokes the same process at low priority:

```bash
bun install -g usagemax
usagemax service install                 # approximately every 15 minutes
usagemax service install --every 30      # 5–1440 minutes
usagemax service status
usagemax service uninstall
```

The scheduler uses a user LaunchAgent on macOS, a user systemd timer on
Linux/WSL, and Task Scheduler on Windows. It does not install a resident
watcher, wake a sleeping computer, download packages per run, or replay missed
intervals. Failures back off for up to six hours and the collector lock prevents
overlapping syncs.

## Recovery and checkpoints

Uploads are idempotent and resumable. Before network I/O, the CLI saves a
bounded journal containing the current run, ordered operations, and next
checkpoint in the user-only config directory. If a process or network request
fails, rerun:

```bash
usagemax sync
```

An expired run can be restarted with `sync --restart`; already accepted usage
remains safe. Do not delete `config.json` to retry a failed upload. See the
[operations runbook](https://github.com/SYMBaiEX/usagemax/blob/main/docs/operations-runbook.md)
for recovery guidance.

## Development

From the repository root:

```bash
bun install
bun run --cwd packages/cli test
bun run --cwd packages/cli pack:check  # dry-run; lifecycle scripts disabled
```

`pack:check` only inspects the local archive shape. It does not publish, contact
the npm registry, or establish that any registry tag contains this version.

The package is MIT-licensed. See the included [LICENSE](LICENSE), the
repository [LICENSE](https://github.com/SYMBaiEX/usagemax/blob/main/LICENSE),
[security policy](https://github.com/SYMBaiEX/usagemax/blob/main/SECURITY.md),
and [contributing guide](https://github.com/SYMBaiEX/usagemax/blob/main/CONTRIBUTING.md).
