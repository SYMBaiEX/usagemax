const markdown = `---
title: UsageMax authorization-server metadata
description: Markdown twin for the WorkOS Connect authorization metadata.
canonical: https://usagemax.com/.well-known/oauth-authorization-server
last-updated: 2026-09-16
---

# UsageMax authorization-server metadata

UsageMax delegates OAuth authorization, consent, refresh, and revocation to its
WorkOS Connect authorization server. The website browser session remains a
separate AuthKit session and is never an API bearer token.

- Issuer: https://wholesome-car-48.authkit.app
- Authorization: https://wholesome-car-48.authkit.app/oauth2/authorize
- Token exchange: https://wholesome-car-48.authkit.app/oauth2/token
- JWKS: https://wholesome-car-48.authkit.app/oauth2/jwks
- Agent registration guide: https://wholesome-car-48.authkit.app/agent/auth.md
- Browser sign-in entry point: https://usagemax.com/auth/start
- OAuth delegation: WorkOS Connect

Collector uploads use a separate installation-bound, write-only umx_ bearer
credential created by the one-use computer link flow. Do not treat a website
session cookie as a collector credential. Agent Registration is enabled from
the WorkOS Authentication → Agents configuration; UsageMax does not invent an
agent_auth block when WorkOS has not enabled that setting.

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
