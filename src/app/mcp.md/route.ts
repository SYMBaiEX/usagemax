const markdown = `---
title: UsageMax MCP server
description: Read-only JSON-RPC tools for querying the UsageMax public surface.
canonical: https://usagemax.com/mcp
last-updated: 2026-09-19
---

# UsageMax MCP server

The UsageMax MCP endpoint is a stateless JSON-RPC server. Send MCP requests to
[\`/mcp\`](https://usagemax.com/mcp) with POST and an \`Accept\` header that includes
\`application/json\` or \`text/event-stream\`. A GET request is intentionally rejected.

The public server exposes bounded, read-only observability tools. Inspect the
[server card](https://usagemax.com/.well-known/mcp/server-card.json) for the
current tool names and input schemas. The [documentation MCP surface](https://usagemax.com/docs-mcp)
is separate from the product surface and is also read-only.

Do not send prompts, completions, credentials, or other secret material. Use
the [sandbox validator](https://usagemax.com/sandbox) to validate telemetry
shapes without writing production data.
`;

const headers = {
  "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
  "content-type": "text/markdown; charset=utf-8",
  "link": '<https://usagemax.com/mcp>; rel="canonical", <https://usagemax.com/mcp>; rel="alternate"; type="application/json"',
  "vary": "Accept, User-Agent",
};

export function GET() {
  return new Response(markdown, { headers });
}

export function HEAD() {
  return new Response(null, { headers });
}
