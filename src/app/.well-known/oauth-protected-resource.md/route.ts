const markdown = `---
title: UsageMax protected resource
description: Collector authentication metadata and privacy boundary.
canonical: https://usagemax.com/.well-known/oauth-protected-resource
last-updated: 2026-09-16
---

# UsageMax protected resource

UsageMax accepts a proprietary, installation-bound, write-only collector token in the Authorization header. It does not currently provide an OAuth authorization server, token endpoint, or delegated API exchange.

- Resource: https://usagemax.com/api
- Collector scopes: \`telemetry:write\`, \`outcomes:write\`
- [Authentication guidance](https://usagemax.com/auth.md)
`;

const headers = {
  "cache-control": "public, max-age=3600",
  "content-type": "text/markdown; charset=utf-8",
  link: '<https://usagemax.com/.well-known/oauth-protected-resource>; rel="canonical"',
  "x-content-type-options": "nosniff",
  vary: "Accept, User-Agent",
};

export function GET() { return new Response(markdown, { headers }); }

export function HEAD() { return new Response(null, { headers }); }
