const markdown = `---
title: UsageMax documentation MCP server
description: Read-only JSON-RPC tools for retrieving UsageMax documentation.
canonical: https://usagemax.com/docs-mcp
last-updated: 2026-09-19
---

# UsageMax documentation MCP server

The documentation MCP endpoint is a stateless, read-only JSON-RPC server at
[\`/docs-mcp\`](https://usagemax.com/docs-mcp). Send requests with POST,
\`Content-Type: application/json\`, and an \`Accept\` header that includes
\`application/json\` or \`text/event-stream\`. GET is not an MCP transport.

Use the [documentation server card](https://usagemax.com/.well-known/mcp/docs-server-card.json)
to discover the current retrieval tools and typed input schemas. For product
observability tools, use the separate [product MCP surface](https://usagemax.com/mcp).

The documentation surface contains public material only. Do not send secrets or
private workspace data.
`;

const headers = {
  "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
  "content-type": "text/markdown; charset=utf-8",
  "link": '<https://usagemax.com/docs-mcp>; rel="canonical", <https://usagemax.com/docs-mcp>; rel="alternate"; type="application/json"',
  "vary": "Accept, User-Agent",
};

export function GET() {
  return new Response(markdown, { headers });
}

export function HEAD() {
  return new Response(null, { headers });
}
