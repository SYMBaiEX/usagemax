# UsageMax Ora-100 package and release readiness

_Internal release record; not a public support or compatibility promise._

Local and live evidence record for the bounded Ora-100 package/release lane,
captured 2026-09-16. This document covers the CLI package, agent plugin
metadata, the published public MCP Registry listing, and open-source release
documentation. It does not claim a fresh Ora score or a published npm or
skills.sh artifact.

## Requirement matrix

| ID | Requirement | Status | Local evidence |
| --- | --- | --- | --- |
| ORA-CLI-01 | CLI discoverability | PASS (local) | `packages/cli/package.json` exposes the `usagemax` bin, focused search keywords, repository/homepage links, and a README with Bun and npm invocation examples. |
| ORA-CLI-02 | Package metadata and archive shape | PASS (local) | Package name/version are `usagemax@0.3.6`; the MIT license, Node.js `>=20` engine, public publish access, explicit package files, and `prepublishOnly` test gate are present. |
| ORA-PLUGIN-01 | Agent plugin manifest | PASS (local) | `plugin.json` is valid JSON, uses the declared Agent Plugins schema, carries version `0.3.6`, MIT licensing, canonical owner links, and truthful MCP/CLI/skills keywords. |
| ORA-MCP-01 | MCP server metadata and listing | PASS (local + live) | `server.json` is valid JSON for `io.github.SYMBaiEX/usagemax`; the official Registry lists active version `1.0.0` and the public streamable-HTTP `/mcp` remote. |
| ORA-OSS-01 | Open-source release documentation | PASS (local) | The package README documents privacy boundaries, safe credential handling, recovery, development checks, and package/repository license and policy links; the included `LICENSE` is MIT. |

The CLI package version (`0.3.6`) and MCP server version (`1.0.0`) are separate
release tracks: the former identifies the executable package and the latter
identifies the public MCP server described by `server.json`.

## Deterministic local gates

| Gate ID | Check | Result |
| --- | --- | --- |
| GATE-CLI-TEST | `bun run --cwd packages/cli test` | PASS: 56 passed, 0 failed, 1 skipped out of 57. The skipped case is the native macOS scheduler execution test; the remaining local CLI suite passed. |
| GATE-PACK-DRY-RUN | `bun run --cwd packages/cli pack:check` and JSON package dry-run | PASS: `usagemax-0.3.6.tgz`, 11 intended files, local shasum `69096699dc9a21b34ee0d848a7988b360e6a3135`, no test fixtures or lockfiles. This is not a registry checksum. |
| GATE-CLI-SMOKE | `node packages/cli/src/cli.js --version` and `--help` | PASS: reports `0.3.6` and exposes the documented commands/options. |
| GATE-METADATA-JSON | Parse and inspect `package.json`, `plugin.json`, and `server.json` locally | PASS: valid JSON and required identity/license/entrypoint/remotes are consistent. |
| GATE-SCOPE | `git diff --check` plus assigned-path inspection | PASS for this lane: its edits are limited to the assigned package/manifest/docs paths, with no application source or lockfile edits from this lane. Concurrent edits appeared elsewhere in the shared worktree during execution and were preserved; this record does not certify their scope. |

## Intentionally skipped external gates

| Gate ID | Check | Result and boundary |
| --- | --- | --- |
| GATE-NPM-PUBLISH | Publish or install a release from npm | SKIPPED: explicitly prohibited for this lane. Local package metadata and dry-run evidence do not prove that npm `latest` contains `0.3.6`. |
| GATE-MCP-REGISTRY-PUBLISH | Publish or verify a Registry listing | PASS: published `io.github.SYMBaiEX/usagemax@1.0.0`; the Registry search and version endpoints return the active record and canonical `https://usagemax.com/mcp` remote. |
| GATE-SKILLS-PUBLISH | Publish or verify skills.sh indexing | SKIPPED: explicitly prohibited; repository skill source is not an external adoption signal. |
| GATE-LIVE-RELEASE | Production endpoint, browser, or external directory acceptance | SKIPPED: outside this local documentation/metadata lane and not required to establish the local gates above. |

No credentials, tokens, prompts, completions, customer data, or private URLs
were committed, logged, or recorded in this document. The MCP Registry
publication was completed with an authenticated maintainer session and verified
independently; npm and skills.sh publication remain separate release-owner
decisions.

At capture time, a read-only npm metadata lookup reported `latest: 0.3.3`.
That external snapshot is recorded only to explain the version boundary; it is
not a publication attempt or a release gate pass.
