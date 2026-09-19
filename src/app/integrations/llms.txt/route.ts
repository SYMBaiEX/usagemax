const markdown = `---
title: UsageMax integrations agent guide
description: Focused integration paths for HTTP, MCP, WebMCP, A2A, OpenTelemetry, and the local collector.
canonical: https://usagemax.com/integrations/llms.txt
last-updated: 2026-09-19
---

# UsageMax integrations

Choose the smallest integration that matches your workflow.

- [HTTP API](/openapi.json): public reads and content-free telemetry endpoints
- [API guide](/api/llms.txt): authentication, batching, idempotency, and errors
- [MCP](/mcp): read-only public tools over Streamable HTTP
- [Documentation MCP](/docs-mcp): read-only documentation lookup tools
- [WebMCP](/webmcp): browser-local tools with a compatibility fallback
- [A2A](/a2a): bounded JSON-RPC queries for agent clients
- [OpenTelemetry](/docs): content-free trace ingestion guidance
- [CLI](/cli.md): one-shot local history collection with optional scheduling
- [Sandbox](/sandbox): no-write validation before collector ingestion
- [Agent mode](/?mode=agent): machine-readable integration index
- [MCP server card](/.well-known/mcp/server-card.json): tool schemas and server identity
- [A2A agent card](/.well-known/agent-card.json): agent identity and capabilities

All UsageMax ingestion paths are content-free by policy. Never transmit prompts, completions, source code, tool arguments, credentials, or private workspace data.
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
