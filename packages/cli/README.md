# UsageMax CLI

Connect aggregate coding-agent usage from every computer to one private UsageMax workspace.

## Quick start

1. Sign in at [usagemax.com/account](https://usagemax.com/account).
2. Choose **Link a computer** and copy the one-time command.
3. Run it in each operating-system environment that contains usage history:

```bash
bunx usagemax@latest link UMX-XXXX-XXXX-XXXX-XXXX
```

The package requires Node.js 20 or newer and works with either npm or Bun:

```bash
npx usagemax@latest link UMX-XXXX-XXXX-XXXX-XXXX
```

The link code expires after ten minutes and can be used once. Create a new code
for each Mac, Windows PC, Linux computer, and WSL distribution. All linked
collectors roll up into the same profile. When run inside WSL, UsageMax includes
readable supported-provider homes under `/mnt/c/Users` automatically. Use the
WSL collector as the single collector for that Windows PC instead of linking the
same host history again from Windows.

The computer name selected in Account is preserved during linking, including
when an older CLI sends its automatic platform label. To intentionally override
it from the terminal, pass `--name "Work laptop"`.

The CLI stores the resulting collector key in a user-only config file, then runs
a one-shot full-history sync. Running it again, changing the display name, or
relinking an installation does not create a second device: the private random
installation identity remains stable.

## Commands

```bash
bunx usagemax                       # sync changed usage
bunx usagemax sync                  # same as above
bunx usagemax sync --full           # reconcile all retained local history
bunx usagemax sync --archives       # one-time compressed-history recovery
bunx usagemax sync --dry-run --explain
                                      # inspect the exact bounded plan; upload nothing
bunx usagemax link UMX-… --no-sync  # link without uploading yet
bunx usagemax status                # show link and last-sync state
bunx usagemax status --remote       # verify the stored key without printing it
bunx usagemax token status          # diagnose a key piped via stdin only
bunx usagemax doctor                # metadata-only source check
bunx usagemax doctor --deep --json  # machine-readable retained-history audit
bunx usagemax report                # open ccusage's local daily report
bunx usagemax report session --breakdown
bunx usagemax unlink                # remove the local collector key
bunx usagemax unlink --revoke       # disable future uploads, then remove locally
```

UsageMax pins [ccusage v20.0.20](https://github.com/ccusage/ccusage/releases/tag/v20.0.20)
and supports all 16 adapters shipped in that release: Amp, Claude Code, Codebuff,
Codex, GitHub Copilot CLI, Factory Droid, Gemini CLI, Goose, Grok Build, Hermes,
Kilo Code, Kimi CLI, OpenClaw, OpenCode, Pi, and Qwen Code. Named Pi-format
stores configured through ccusage are also discovered.

The source inventory follows ccusage's environment overrides, including
`CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `OPENCODE_DATA_DIR`, `AMP_DATA_DIR`,
`DROID_SESSIONS_DIR`, `CODEBUFF_DATA_DIR`, `HERMES_HOME`, `PI_AGENT_DIR`,
`GOOSE_PATH_ROOT`, `OPENCLAW_DIR`, `KILO_DATA_DIR`, `KIMI_DATA_DIR`,
`QWEN_DATA_DIR`, `COPILOT_OTEL_FILE_EXPORTER_PATH`, `GEMINI_DATA_DIR`, and
`GROK_HOME`. It also follows XDG Claude configuration and Windows Goose storage.

UsageMax also discovers Claude Desktop local-agent sessions, `.cc-mirror`,
recognizable renamed Claude/Codex backup folders, and supported Windows homes
from WSL. Discovery is bounded to known locations and immediate home entries;
normal syncs do not crawl the whole disk.
On a multi-user WSL host, automatic Windows-home discovery stays off unless
there is exactly one provider-bearing profile; set `USAGEMAX_ADDITIONAL_HOME`
to the intended mounted home explicitly.

If `doctor` reports compressed provider archives, run `sync --archives` once.
Recovery extracts only safe Claude `projects/*.jsonl` members into a private
temporary directory, performs one full deduplicated reconciliation, and removes
the temporary files before exit. Weekly and incremental syncs never unpack
archives.

Local files are only one coverage layer. Cursor, Windsurf, Aider, Continue,
Cline, Roo Code, direct provider API traffic, hosted agents, and enterprise
billing systems do not all expose a stable local token ledger. Capture those
through UsageMax's native or OTLP endpoint, or through a future provider billing
connector. UsageMax never invents usage that the source did not retain.

## Privacy, correctness, and load

Interrupted uploads resume with `bunx usagemax sync`. Server upload runs expire
after 30 idle days. If the server reports an expired run, use `sync --restart`:
this preserves the last committed checkpoint and performs a fresh full scan.
It never automatically replays an old authoritative deletion against newer data.

- The sync payload contains aggregate token counts,
  model/provider names, costs, source names, dates, coverage state, and opaque
  SHA-256 session identities.
- It does not upload prompts, completions, source code, file contents, project
  paths, or provider credentials.
- Sync is one-shot. There is no resident scanner or high-frequency polling loop.
- A successful previous parse with a complete, unchanged metadata inventory skips
  parsing and uploading again that day. Inventory stability is independent of
  deletion authority; a no-change result retains the previous partial coverage
  label. New sources, date rollover, explicit full/archive requests and weekly
  reconciliation still trigger the appropriate scan.
- Normal changed syncs parse today or today plus yesterday. A bounded weekly
  full reconciliation catches restored files, parser changes, and older logs.
- Full history scans retained local history from 2024 onward. Inventory success
  does not prove every file parsed. Until the parser certifies source/day coverage,
  uploads are marked partial and any row with a decreasing counter retains its
  entire previous vector. This includes explicit zeros and missing sources.
  Older checkpoints survive incremental windows. Authoritative corrections remain
  supported by the planner but are not claimed by this parser integration.
  Deleted or never-persisted usage requires a provider export.
- Source totals that cannot be assigned to a model are retained as
  `unattributed` rather than silently discarded.
- The collector key is written with user-only permissions where the operating
  system supports them.
- The package contains no shared service credential or private deployment URL.
  It talks to the versioned `https://usagemax.com/api` contract. The random
  per-installation write token is the only local secret; the service stores only
  its hash and applies device binding, replay checks, payload caps, and quotas.
- A private random installation ID survives collector rotation, relinking, and
  display-name changes. It is not a hardware fingerprint; the server stores only
  its SHA-256 hash. A local config lock prevents overlapping commands from
  overwriting pending runs; server receipts make repeated uploads idempotent.
- The server, not the local checkpoint, owns the accounting baseline. A lost
  response or interrupted run can be retried without adding the same partition twice.
- Do not point two different installations at the same copied or network-mounted
  log tree. Cross-installation copied-history deduplication is inherently
  ambiguous and intentionally not guessed.

Use `USAGEMAX_CONFIG_DIR` to select another config directory. Development and
self-hosted installations may set `USAGEMAX_LINK_ENDPOINT` before linking.

For a key created under **Advanced · custom telemetry collector**, use the
read-only diagnostic without putting the secret in shell history or process
arguments:

```bash
printf '%s' "$USAGEMAX_COLLECTOR_TOKEN" \
  | bunx usagemax token status --device-id "$USAGEMAX_INSTALLATION_ID"
```

The diagnostic reports the key format, collector type, scopes, activation
state, ingest authorization, profile/name, and whether the supplied installation
is unbound, bound, matched, or mismatched. It never returns or prints the token.
If `scopeStatus` is `missing_telemetry_write`, the key is recognized but cannot
write to the LLM telemetry endpoint. Advanced keys
are active immediately, do not need propagation, and bind their first valid
installation on the first write. Use the [zero-token telemetry example](https://usagemax.com/api/v1/sandbox)
for a no-accounting contract check.

## Optional automatic sync

Automatic sync is **off by default**. Install a persistent CLI first (a bunx/npx
cache can disappear), link the computer if needed, then opt in:

```bash
bun install -g usagemax
usagemax service install                 # approximately every 15 minutes
usagemax service install --every 30      # change interval; 5–1440 minutes
usagemax service status                  # scheduler reachability + last result
usagemax service run                     # run now, respecting failure backoff
usagemax service uninstall               # stop future jobs; retain account/data
```

Uses a user LaunchAgent on macOS, a user systemd timer on Linux/WSL, and Task
Scheduler on Windows. No admin/root access, resident daemon, file watcher,
automatic package updates, or package downloads per run. Each job runs the normal
incremental sync and exits. No-change runs skip parsing/uploading when the source
inventory is complete and unchanged. The metadata inventory still costs disk I/O;
an active or first/full-history scan costs more. This is periodic, not live telemetry.

Schedules are spread by up to a minute. macOS/Linux jobs have reduced CPU/I/O
priority. Windows jobs require a signed-in user and defer starting on battery.
Jobs do not wake a sleeping computer. Linux needs a running systemd user manager;
WSL must already be running with systemd enabled. UsageMax does not enable linger
or keep a WSL distro alive. Missed intervals are not replayed as a backlog.

The existing collector lock prevents overlapping uploads. Failures back off
exponentially (up to six hours); manually running `usagemax sync` is available for
diagnosis without waiting. `service-state.json` retains only the latest bounded
status, timestamps, duration, and failure count, not raw logs or credentials.
If a process was forcibly killed, inspect the PID reported by `sync` before
removing its stale `collector.lock`; never delete `config.json` to retry.

Re-run `service install` after upgrading/moving the CLI or changing source-path
environment variables. Only an explicit allowlist of discovery settings is saved,
not your shell's secrets. Jobs run from your home directory; repository-local
`.ccusage/ccusage.json` configuration is not automatically used. Keep the runtime
and global CLI installed. `service uninstall` leaves existing usage, link credentials,
checkpoints, and last-run status intact; an in-flight sync may finish.

The short-lived CLI sets its process title to `UsageMax`. On macOS and Windows,
`service install` also stages a private, product-named runtime at
`<config-dir>/runtime/bin/UsageMax` (or `UsageMax.exe`) and schedules that image, so
Activity Monitor/Task Manager does not show the scheduled job as a generic
`node` process. Re-run `service install` after upgrading Node or moving the CLI
so the staged runtime is refreshed.

## Interrupted uploads and protocol details

Before uploading, the CLI saves the exact run, ordered request payloads and next
checkpoint in the private config. `sync` resumes this journal before scanning new
data. Local snapshots advance only after completion is acknowledged. A resumed
command finishes the saved scan; run `sync` again to collect subsequent changes.
`sync --dry-run` reports pending work without uploading. Do not delete config.json
to retry a failed upload. A successful relink or unlink replaces/removes the local
journal along with its credential.

Network failures, malformed success responses, HTTP 429 and 5xx get at most five
attempts per request with exponential jitter. Retry-After seconds and HTTP dates
are honored up to 60 seconds; longer waits stop with an instruction to retry later.
Only completion's `snapshot_run_incomplete` HTTP 409 is retried, because server
cleanup can still be pending. Authentication, validation and other conflicts fail
with an actionable message and retain the journal. JSON `accepted` is null for
uploads because lost responses/replays cannot reliably reconstruct that count;
`changedRows` is the local planned count, not a server accounting receipt.

Each sorted source/day is sent as ordered chunks of at most 100 rows. Each has a
unique partitionId, zero-based chunkIndex and shared chunkCount. The payload hash
covers `{source, day, complete, pricingVersion, chunkIndex, chunkCount, rows}` in
that order. `partitionCount` counts transmitted chunks. The server must accept
this protocol, receipt replays, and finish omitted-row cleanup before completing
an authoritative run.

An abrupt process kill can leave `collector.lock` in the config directory. The
next command reports the owner PID and exact path. Confirm that process has exited
before removing only that lock file, then rerun sync. Never remove an active lock
or the saved config to recover. Normal completion and handled failures release it.

See the [collector coverage audit](../../docs/collector-coverage-audit.md) for
the full support matrix and known boundaries.
