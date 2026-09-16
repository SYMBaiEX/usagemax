const markdown = `---
title: UsageMax API agent guide
description: Public reads and content-free collector write contract.
canonical: https://usagemax.com/api/llms.txt
last-updated: 2026-09-16
---

# UsageMax API

The UsageMax HTTP API has public read operations and authenticated, content-free collector write operations.

- [OpenAPI contract](/openapi.json): canonical typed request and response schema
- [Protected-resource metadata](/.well-known/oauth-protected-resource): collector credential metadata
- [Authentication](/auth.md): credential, header, revocation, and error guidance
- [API catalog](/.well-known/api-catalog): RFC 9727 Linkset discovery
- [Network stats](/api/stats): bounded public aggregate totals
- [Leaderboard](/api/leaderboard?metric=tokens&window=all): bounded public rankings
- [Public profile](/api/profiles/{handle}): opt-in profile projection
- [MCP](/mcp): read-only tool interface for public projections
- [A2A](/a2a): read-only JSON-RPC agent interface for bounded public questions

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
