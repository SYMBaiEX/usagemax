const markdown = `---
title: UsageMax integrations
description: Connect UsageMax to AI agents, local collectors, and observability systems.
canonical: https://usagemax.com/integrations
last-updated: 2026-09-19
---

# UsageMax integrations

UsageMax fits around existing AI development and observability workflows. Every
surface is bounded and designed to keep prompts, completions, credentials, and
private workspace data outside the public projection.

## Integration surfaces

| Surface | Use it for | Access |
| --- | --- | --- |
| [HTTP API](/openapi.json) | Public aggregates and content-free telemetry | OpenAPI |
| [MCP](/mcp) | Read-only assistant tools for profiles, rankings, and network totals | Streamable HTTP |
| [WebMCP](/webmcp) | Browser-agent discovery of public tools | document.modelContext |
| [Local collector](/cli.md) | One-shot provider-history reconciliation per computer | \`bunx usagemax\` |
| [OpenTelemetry docs](/docs) | Content-free spans and model activity | HTTPS traces endpoint |
| [A2A](/a2a) | Bounded machine-readable agent questions | JSON-RPC |

## Safe connection path

1. Use the [sandbox](/sandbox) to validate a content-free event without writing data.
2. Read the [authentication guide](/auth.md) before creating or using a collector link.
3. Use the [OpenAPI contract](/openapi.json) for request and error schemas.
4. Send only metadata intended for processing, with idempotency keys on writes.

Collector writes require an installation-bound, write-only bearer token and the
\`x-usagemax-device-id\` header. Public reads do not require a credential. UsageMax
does not provide a general OAuth token exchange for API delegation.

## Discovery

- [Agent mode](https://usagemax.com/?mode=agent)
- [Agent resource discovery](https://usagemax.com/.well-known/ard.json)
- [MCP server card](https://usagemax.com/.well-known/mcp/server-card.json)
- [Agent skills index](https://usagemax.com/.well-known/agent-skills/index.json)
- [Full agent guide](/llms.txt)
`;

const headers = {
  "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
  "content-type": "text/markdown; charset=utf-8",
  vary: "Accept",
};

export function GET() { return new Response(markdown, { headers }); }
export function HEAD() { return new Response(null, { headers }); }
