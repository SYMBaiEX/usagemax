const markdown = `---
title: UsageMax protected resource
description: WorkOS delegated OAuth, collector authentication metadata, and privacy boundary.
canonical: https://usagemax.com/.well-known/oauth-protected-resource
last-updated: 2026-09-16
---

# UsageMax protected resource

UsageMax accepts WorkOS Connect delegated access tokens and a separate
installation-bound, write-only collector token in the Authorization header.
WorkOS owns the authorization server, consent, token exchange, refresh, and
revocation.

- Resource: https://usagemax.com/api
- Authorization server: https://wholesome-car-48.authkit.app
- Collector scopes: \`telemetry:write\`, \`outcomes:write\`
- Delegated scopes: \`usage:read\`, \`data:export\`, \`telemetry:write\`, \`outcomes:write\`
- [WorkOS agent registration skill](https://wholesome-car-48.authkit.app/agent/auth.md)
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
