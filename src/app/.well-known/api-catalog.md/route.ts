const markdown = `---
title: UsageMax API catalog
description: Public API linkset discovery for UsageMax.
canonical: https://usagemax.com/.well-known/api-catalog
last-updated: 2026-09-16
---

# UsageMax API catalog

- [Documentation](https://usagemax.com/docs)
- [OpenAPI contract](https://usagemax.com/openapi.json)
- [Native telemetry](https://usagemax.com/api/v1/telemetry/llm)
- [OpenTelemetry traces](https://usagemax.com/api/v1/traces)
- [Usage snapshots](https://usagemax.com/api/v2/usage/snapshots)
`;

export function GET() { return new Response(markdown, { headers: { "cache-control": "public, max-age=3600", "content-type": "text/markdown; charset=utf-8", vary: "Accept, User-Agent" } }); }
