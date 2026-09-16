const markdown = `---
title: UsageMax authorization-server metadata
description: Markdown twin for the UsageMax browser-session authorization metadata.
canonical: https://usagemax.com/.well-known/oauth-authorization-server
last-updated: 2026-09-16
---

# UsageMax authorization-server metadata

UsageMax publishes an RFC 8414-shaped discovery document for its website
authorization entry point. It starts a WorkOS AuthKit browser session; it does
not mint a general-purpose API access token.

- Issuer: https://usagemax.com
- Authorization endpoint: https://usagemax.com/auth/start
- Response type: code
- Website scope: website_session
- Token endpoint authentication methods: none advertised
- OAuth delegation: false

Collector uploads use a separate installation-bound, write-only umx_ bearer
credential created by the one-use computer link flow. Do not treat a website
session cookie as a collector credential.

- [JSON authorization-server metadata](https://usagemax.com/.well-known/oauth-authorization-server)
- [Protected-resource metadata](https://usagemax.com/.well-known/oauth-protected-resource)
- [Authentication walkthrough](https://usagemax.com/auth.md)
`;

const headers = {
  "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
  "content-type": "text/markdown; charset=utf-8",
  vary: "Accept, User-Agent",
};

export function GET() {
  return new Response(markdown, { headers });
}

export function HEAD() {
  return new Response(null, { headers });
}
