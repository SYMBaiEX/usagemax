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
- [Leaderboard](/leaderboard)
- [Methodology](/methodology)
- [Security](/security)
- [OpenAPI](/openapi.json)
- [MCP](/mcp)

Public projections may include aggregate network totals, public profile totals, model mix, bounded daily rollups, and a short live activity window. They do not include prompts, completions, credentials, or private workspace data.
`;

export function GET() {
  return new Response(markdown, { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=3600, stale-while-revalidate=86400", vary: "Accept" } });
}
