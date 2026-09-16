const markdown = `---
title: UsageMax documentation MCP server card
description: Machine-readable identity and read-only tools for the UsageMax documentation MCP server.
canonical: https://usagemax.com/.well-known/mcp/docs-server-card.json
last-updated: 2026-09-16
---

# UsageMax documentation MCP server

The UsageMax documentation server is a stateless, unauthenticated, read-only
Streamable HTTP MCP surface. It helps agents find and retrieve public product,
privacy, security, and integration guidance.

- Server URL: https://usagemax.com/docs-mcp
- Protocol: Streamable HTTP, MCP 2025-06-18
- Authentication: none
- Writes: none
- Private workspace data: unavailable
- Collector credentials: unavailable

## Tools

- docs_list — list the bounded documentation resources.
- docs_search — search the public documentation index.
- docs_get — retrieve one named documentation resource.

Use the [JSON server card](https://usagemax.com/.well-known/mcp/docs-server-card.json)
for the complete schemas. The [human documentation](https://usagemax.com/docs)
and [API contract](https://usagemax.com/openapi.json) provide the broader
UsageMax integration boundary.
`;

const headers = {
  "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
  "content-type": "text/markdown; charset=utf-8",
  vary: "Accept, User-Agent",
};

export function GET() {
  return new Response(markdown, { headers });
}

export function HEAD() {
  return new Response(null, { headers });
}
