const markdown = `---
title: UsageMax CLI
description: Install, link, sync, and schedule the lightweight UsageMax collector.
canonical: https://usagemax.com/cli.md
last-updated: 2026-09-16
---

# UsageMax CLI

The UsageMax CLI is a short-lived, one-shot collector for supported local AI usage histories. It reads provider files locally, sends bounded aggregate snapshots over HTTPS, and exits. It does not run a filesystem watcher or resident telemetry daemon.

## Install

Run <code>bunx usagemax --help</code> or
<code>npm exec --yes usagemax -- --help</code>. To install a global
command, run <code>npm install --global usagemax</code> and then
<code>usagemax --help</code>. The package is published on
[npm](https://www.npmjs.com/package/usagemax); use the repository source when
you need a release newer than the current public npm tag. The CLI checks npm's
<code>latest</code> dist-tag at most twice per day and never replaces itself
silently. Run <code>usagemax update sync</code> to hand a command to the current
release without typing <code>@latest</code>, or set
<code>USAGEMAX_AUTO_UPDATE=1</code> for an explicit automatic handoff. Set
<code>--no-update-check</code> or <code>USAGEMAX_DISABLE_UPDATE_CHECK=1</code> in
offline environments. Interactive
terminals show a small stderr progress line; JSON, quiet, CI, and scheduled runs
remain machine-readable and quiet.

## Link a computer

1. Sign in at [UsageMax](https://usagemax.com/sign-in).
2. Create a one-use computer link from [Account](https://usagemax.com/account).
3. Run <code>bunx usagemax link UMX-XXXX-XXXX-XXXX-XXXX</code> on the computer.
4. Run <code>usagemax sync</code> to upload a bounded reconciliation.

The computer name selected in Account is retained. Use <code>--name "Work laptop"</code> only when you want the current CLI to explicitly override that account-side name.

The link code and collector token are never included in documentation examples, URLs, telemetry fields, or logs. Use <code>usagemax status</code> to inspect local state without printing the token. Add <code>--remote</code> to verify the stored key against UsageMax without exposing it. The <code>token status</code> diagnostic is included in CLI <code>0.3.8</code>; if npm <code>latest</code> still points to an older release, run <code>usagemax update token status</code> or <code>node packages/cli/src/cli.js token status</code> from the repository until that release is published.

For an advanced key that is not stored by the CLI, pipe the token through stdin and optionally check an installation UUID:

    printf '%s' "$USAGEMAX_COLLECTOR_TOKEN" | usagemax token status --device-id "$USAGEMAX_INSTALLATION_ID"

The status check is read-only. It reports the key format, collector scopes, activation state, account-side profile/name, and whether the supplied installation is unbound, bound, matched, or mismatched. New advanced keys do not require activation; linked CLI keys are bound during the link exchange.

Snapshot uploads return a read-only status URL and <code>Location</code> header for the current run. Poll it with the same bearer token and installation UUID; it reports bounded progress and coverage metadata, never snapshot rows, workspace identifiers, or credential hashes.

## Optional scheduling

Use <code>usagemax service install</code> only when periodic checkpoints are wanted. The scheduler invokes the same bounded one-shot process at a low priority; it does not keep a background scanner resident. Use <code>service status</code>, <code>service uninstall</code>, or the platform scheduler controls to manage it.

See the [authentication guide](https://usagemax.com/auth.md), [sandbox](https://usagemax.com/sandbox), and [OpenAPI contract](https://usagemax.com/openapi.json) for the credential and request boundary.
`;

const headers = { "cache-control": "public, max-age=3600, stale-while-revalidate=86400", "content-type": "text/markdown; charset=utf-8", vary: "Accept" };

export function GET() { return new Response(markdown, { headers }); }
export function HEAD() { return new Response(null, { headers }); }
