const markdown = `---
title: UsageMax
description: Public observability for bounded AI usage telemetry.
canonical: https://usagemax.com/
last-updated: 2026-09-16
---

# UsageMax

UsageMax is a public observability layer for bounded AI usage telemetry.

## Public surface

- [Documentation](/docs)
- [Free plans and pricing](/pricing)
- [Get started](/sign-up)
- [No-write sandbox](/sandbox)
- [Leaderboard](/leaderboard)
- [Methodology](/methodology)
- [Security](/security)
- [OpenAPI](/openapi.json)
- [Agent resource discovery](/.well-known/ard.json)
- [AI catalog](/.well-known/ai-catalog.json)
- [Schema feed](/schema-feed.jsonl)
- [Agent skills](/.well-known/agent-skills/index.json)
- [Agent capability index](/agent.json)
- [Homepage agent mode](https://usagemax.com/?mode=agent)
- [MCP](/mcp)
- [MCP Registry listing](https://registry.modelcontextprotocol.io/v0.1/servers/io.github.SYMBaiEX%2Fusagemax/versions/latest)
- [WebMCP guide](/webmcp)

Public projections may include aggregate network totals, public profile totals, model mix, bounded daily rollups, and a short live activity window. They do not include prompts, completions, credentials, or private workspace data.
`;

export function GET() {
  return new Response(markdown, { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=3600, stale-while-revalidate=86400", vary: "Accept" } });
}
