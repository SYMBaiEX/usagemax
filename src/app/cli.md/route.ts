const markdown = `---
title: UsageMax CLI
description: Install, link, sync, and schedule the lightweight UsageMax collector.
canonical: https://usagemax.com/cli.md
last-updated: 2026-09-16
---

# UsageMax CLI

The UsageMax CLI is a short-lived, one-shot collector for supported local AI usage histories. It reads provider files locally, sends bounded aggregate snapshots over HTTPS, and exits. It does not run a filesystem watcher or resident telemetry daemon.

## Install

Run <code>bunx usagemax@latest --help</code> or install the package from [npm](https://www.npmjs.com/package/usagemax).

## Link a computer

1. Sign in at [UsageMax](https://usagemax.com/sign-in).
2. Create a one-use computer link from [Account](https://usagemax.com/account).
3. Run <code>bunx usagemax@latest link UMX-XXXX-XXXX-XXXX-XXXX</code> on the computer.
4. Run <code>bunx usagemax@latest sync</code> to upload a bounded reconciliation.

The computer name selected in Account is retained. Use <code>--name "Work laptop"</code> only when you want the current CLI to explicitly override that account-side name.

The link code and collector token are never included in documentation examples, URLs, telemetry fields, or logs. Use <code>bunx usagemax@latest status</code> to inspect local state without printing the token.

## Optional scheduling

Use <code>bunx usagemax@latest service install</code> only when periodic checkpoints are wanted. The scheduler invokes the same bounded one-shot process at a low priority; it does not keep a background scanner resident. Use <code>service status</code>, <code>service uninstall</code>, or the platform scheduler controls to manage it.

See the [authentication guide](https://usagemax.com/auth.md), [sandbox](https://usagemax.com/sandbox), and [OpenAPI contract](https://usagemax.com/openapi.json) for the credential and request boundary.
`;

const headers = { "cache-control": "public, max-age=3600, stale-while-revalidate=86400", "content-type": "text/markdown; charset=utf-8", vary: "Accept" };

export function GET() { return new Response(markdown, { headers }); }
export function HEAD() { return new Response(null, { headers }); }
