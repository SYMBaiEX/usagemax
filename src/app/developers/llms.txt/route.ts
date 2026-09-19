const markdown = `---
title: UsageMax developer agent guide
description: API, protocol, and SDK resources for integrating UsageMax.
canonical: https://usagemax.com/developers/llms.txt
last-updated: 2026-09-19
---

# UsageMax developers

Use this focused index when you are integrating UsageMax into an agent, service, or local collector.

- [Agent mode](/?mode=agent): structured capability, endpoint, limit, and authentication metadata
- [OpenAPI](/openapi.json): canonical typed HTTP contract
- [API guide](/api/llms.txt): public reads and content-free collector writes
- [MCP server](/mcp): read-only Streamable HTTP tools
- [Documentation MCP](/docs-mcp): read-only documentation tools
- [A2A agent](/a2a): bounded JSON-RPC public resource queries
- [WebMCP](/webmcp): browser-local tools registered with document.modelContext
- [Sandbox](/sandbox): validate content-free event batches without writing data
- [Authentication](/auth.md): supported website and collector credentials
- [CLI](/cli.md): install, link, sync, and optional scheduling
- [API versioning](/api-versioning.md): compatibility and deprecation policy
- [npm package](https://www.npmjs.com/package/usagemax): official collector package

Public reads require no credential. Collector writes require an installation-bound bearer token and device header. Do not send prompts, completions, source code, credentials, or private workspace data.
`;

const headers = {
  "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
  "content-type": "text/plain; charset=utf-8",
  vary: "Accept",
};

export function GET() {
  return new Response(markdown, { headers });
}

export function HEAD() {
  return new Response(null, { headers });
}
