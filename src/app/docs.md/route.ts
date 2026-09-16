const markdown = `---
title: UsageMax documentation
description: Bounded telemetry, integration, and privacy guidance.
canonical: https://usagemax.com/docs
last-updated: 2026-09-16
---

# UsageMax documentation

Send bounded model, tool, agent-state, and outcome metadata through the native telemetry endpoint or OpenTelemetry traces. Each native event requires an idempotent \`eventKey\`, \`model\`, and \`occurredAt\`.

Do not send prompts, completions, secrets, or access tokens. Public queries expose bounded aggregate projections only.

Start with the [free plan](/pricing), [account sign-up](/sign-up), and [no-write sandbox](/sandbox). The [sandbox descriptor](/api/v1/sandbox), [OpenAPI contract](/openapi.json), [agent resource catalog](/.well-known/ard.json), and [schema feed](/schema-feed.jsonl) are machine-readable resources.

See the [HTML documentation](/docs), [WebMCP guide](/webmcp), [official MCP Registry listing](https://registry.modelcontextprotocol.io/v0.1/servers/io.github.SYMBaiEX%2Fusagemax/versions/latest), and [security overview](/security).
`;

export function GET() { return new Response(markdown, { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=3600, stale-while-revalidate=86400", vary: "Accept" } }); }
