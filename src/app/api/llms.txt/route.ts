const markdown = `# UsageMax API

The UsageMax HTTP API has public read operations and authenticated, content-free collector write operations.

<!-- title: UsageMax API agent guide; canonical: https://usagemax.com/api/llms.txt; last-updated: 2026-09-16 -->

- [OpenAPI contract](/openapi.json): canonical typed request and response schema
- [API versioning](/api-versioning.md): compatibility and deprecation policy
- [CLI guide](/cli.md): install, link, sync, and scheduling
- [Protected-resource metadata](/.well-known/oauth-protected-resource): collector credential metadata
- [Authentication](/auth.md): credential, header, revocation, and error guidance
- [API catalog](/.well-known/api-catalog): RFC 9727 Linkset discovery
- [AI Catalog compatibility](/.well-known/ai-catalog.json): equivalent legacy discovery catalog
- [Network stats](/api/stats): bounded public aggregate totals
- [Leaderboard](/api/leaderboard?metric=tokens&window=all): bounded public rankings
- [Public profile](/api/profiles/{handle}): opt-in profile projection
- [MCP](/mcp): read-only tool interface for public projections
- [A2A](/a2a): read-only JSON-RPC agent interface for bounded public questions
- [Sandbox descriptor](/api/v1/sandbox): no-write validation environment and example

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
