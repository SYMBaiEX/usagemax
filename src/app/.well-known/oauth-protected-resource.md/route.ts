const markdown = `---
title: UsageMax protected resource metadata
description: Collector authentication boundary for UsageMax.
canonical: https://usagemax.com/.well-known/oauth-protected-resource
last-updated: 2026-09-16
---

# UsageMax protected resource

UsageMax accepts a proprietary, installation-bound, write-only collector token in the Authorization header. It does not currently provide an OAuth authorization server, token endpoint, or delegated API exchange.

- Resource: https://usagemax.com/api
- [Authentication guidance](https://usagemax.com/auth.md)
`;

export function GET() { return new Response(markdown, { headers: { "cache-control": "public, max-age=3600", "content-type": "text/markdown; charset=utf-8", vary: "Accept, User-Agent" } }); }
