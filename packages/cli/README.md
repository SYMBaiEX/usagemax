# UsageMax CLI

Connect aggregate coding-agent usage from every computer to one private UsageMax workspace.

## Quick start

1. Sign in at [usagemax.com/account](https://usagemax.com/account).
2. Choose **Link a computer** and copy the one-time command.
3. Run it in each operating-system environment that contains usage history:

```bash
bunx usagemax@latest link UMX-XXXX-XXXX-XXXX-XXXX
```

The link code expires after ten minutes and can be used once. Create a new code
for each Mac, Windows PC, Linux computer, and WSL distribution. All linked
collectors roll up into the same profile. When run inside WSL, UsageMax includes
readable supported-provider homes under `/mnt/c/Users` automatically. Use the
WSL collector as the single collector for that Windows PC instead of linking the
same host history again from Windows.

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

- The sync payload contains authoritative aggregate token counts,
  model/provider names, costs, source names, dates, coverage state, and opaque
  SHA-256 session identities.
- It does not upload prompts, completions, source code, file contents, project
  paths, or provider credentials.
- Sync is one-shot. There is no resident scanner or high-frequency polling loop.
- A metadata inventory exits without parsing logs or using the network when
  nothing changed.
- Normal changed syncs parse today or today plus yesterday. A bounded weekly
  full reconciliation catches restored files, parser changes, and older logs.
- Full history means all retained local history from 2024 onward. UsageMax
  publishes complete source/day partitions, so decreased or removed local rows
  correct the server-owned contribution instead of being silently retained.
  Deleted or
  never-persisted usage requires a provider export; no local tool can reconstruct it.
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
  its SHA-256 hash. Concurrent and repeated syncs are idempotent.
- The server, not the local checkpoint, owns the accounting baseline. A lost
  response or interrupted run can be retried without adding the same partition twice.
- Do not point two different installations at the same copied or network-mounted
  log tree. Cross-installation copied-history deduplication is inherently
  ambiguous and intentionally not guessed.

Use `USAGEMAX_CONFIG_DIR` to select another config directory. Development and
self-hosted installations may set `USAGEMAX_LINK_ENDPOINT` before linking.

See the [collector coverage audit](../../docs/collector-coverage-audit.md) for
the full support matrix and known boundaries.
