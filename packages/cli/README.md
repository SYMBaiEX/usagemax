# UsageMax CLI

Connect aggregate coding-agent usage from your computer to a private UsageMax workspace.

## Quick start

1. Sign in at [usagemax.com/account](https://usagemax.com/account).
2. Choose **Link a computer** and copy the one-time command.
3. Run it locally:

```bash
bunx usagemax link UMX-XXXX-XXXX-XXXX-XXXX
```

The link code expires after ten minutes and can be used once. The CLI stores the resulting collector key in a user-only config file, then runs a one-shot sync.

## Commands

```bash
bunx usagemax              # sync changed usage
bunx usagemax sync         # same as above
bunx usagemax sync --full  # inspect all available local history
bunx usagemax link UMX-… --no-sync # link without uploading yet
bunx usagemax status       # show link and last-sync state
bunx usagemax doctor       # metadata-only source check; does not parse logs
bunx usagemax doctor --deep # opt into a full local parser check
bunx usagemax report       # open ccusage's local daily report
bunx usagemax report session --breakdown
bunx usagemax unlink       # remove the local collector key
```

UsageMax uses [ccusage](https://github.com/ccusage/ccusage) for local source detection, responsive reports, cached pricing, model breakdowns, date handling, and support for popular coding-agent CLIs. `report` passes its remaining arguments to ccusage.

## Privacy and load

- The sync payload contains aggregate token counts, model/provider names, costs, source names, and dates.
- It does not upload prompts, completions, source code, file contents, project paths, or provider credentials.
- Sync is one-shot. There is no resident scanner or high-frequency polling loop.
- After the first import, normal syncs inspect only the current and previous local day; use `sync --full` to reconcile older history.
- The collector key is written with user-only permissions where the operating system supports them.
- A separate private random installation ID survives collector rotation, relinking, and display-name changes. It is not a hardware fingerprint; the server stores only its SHA-256 hash. Concurrent or repeated syncs remain idempotent.

Use `USAGEMAX_CONFIG_DIR` to select another config directory. Development/self-hosted installations may set `USAGEMAX_LINK_ENDPOINT` before linking.
