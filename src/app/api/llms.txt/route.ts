const markdown = `---
title: UsageMax API agent guide
description: Public reads, sandbox validation, and content-free collector contracts.
canonical: https://usagemax.com/api/llms.txt
last-updated: 2026-09-19
---

# UsageMax API

The UsageMax HTTP API has public read operations and authenticated, content-free collector write operations.

- [OpenAPI contract](/openapi.json): canonical typed request and response schema
- [API versioning](/api-versioning.md): compatibility and deprecation policy
- [CLI guide](/cli.md): install, link, sync, and scheduling
- [Protected-resource metadata](/.well-known/oauth-protected-resource): collector credential metadata
- [Authentication](/auth.md): credential, header, revocation, and error guidance
- [Pricing](/pricing.md): machine-readable personal, small-team, and enterprise plan boundaries
- [Collector status](/api/v1/devices/status): read-only key and device-binding diagnostic
- [Snapshot run status](/api/v2/usage/snapshots/{runId}): read-only progress for the same bearer token and device UUID
- [API catalog](/.well-known/api-catalog): RFC 9727 Linkset discovery
- [AI Catalog compatibility](/.well-known/ai-catalog.json): equivalent legacy discovery catalog
- [Network stats](/api/stats): bounded public aggregate totals
- [Leaderboard](/api/leaderboard?metric=tokens&window=all): bounded public rankings
- [Public profile](/api/profiles/{handle}): opt-in profile projection
- [MCP](/mcp): read-only tool interface for public projections
- [WebMCP](/webmcp): browser-local read-only tools using document.modelContext
- [A2A](/a2a): read-only JSON-RPC agent interface for bounded public questions
- [Sandbox descriptor](/api/v1/sandbox): no-write validation environment and example
- [Batch validator alias](/api/v1/batch): no-write POST alias documented in OpenAPI

## Source

- [UsageMax repository](https://github.com/SYMBaiEX/usagemax)
- [OpenAPI contract](https://usagemax.com/openapi.json)

Public reads require no credential. Collector writes use a one-time link flow, a write-only installation-bound Bearer token, x-usagemax-device-id, JSON, and idempotency keys. The API rejects or ignores private content by policy. It is not a general OAuth delegation API.
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
