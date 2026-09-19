const markdown = `---
title: UsageMax documentation agent guide
description: Product, privacy, and integration guidance for UsageMax.
canonical: https://usagemax.com/docs/llms.txt
last-updated: 2026-09-19
---

# UsageMax documentation

Use this section when you need to understand the product, privacy boundary, or integration contract before calling UsageMax.

- [Documentation](/docs): human-facing setup and telemetry guidance
- [Methodology](/methodology): aggregation, pricing, completeness, and ranking rules
- [Security](/security): threat model and data boundaries
- [Privacy](/privacy): retention and public-profile controls
- [Authentication](/auth.md): actual website and collector credential flow
- [Pricing](/pricing.md): machine-readable free plans and scoped enterprise capacity
- [Collector status](/api/v1/devices/status): read-only key and device-binding diagnostic
- [OpenAPI](/openapi.json): typed HTTP contract
- [CLI guide](/cli.md): install, link, sync, and scheduling
- [API versioning](/api-versioning.md): compatibility and deprecation policy
- [MCP](/mcp): read-only public and docs Streamable HTTP tools
- [WebMCP](/webmcp): bounded read-only in-page tools using document.modelContext
- [Sandbox](/sandbox): exercise the content-free validation contract without a write

UsageMax is appropriate for public aggregate AI usage reporting and for linking a local coding-agent history to one account. Never send prompts, completions, source code, file paths, tool arguments, credentials, or other secrets.
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
