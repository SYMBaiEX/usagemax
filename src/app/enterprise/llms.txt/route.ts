const markdown = `---
title: UsageMax enterprise agent guide
description: Workspace, governance, privacy, and capacity guidance for UsageMax teams.
canonical: https://usagemax.com/enterprise/llms.txt
last-updated: 2026-09-19
---

# UsageMax enterprise

Use this focused index when evaluating UsageMax for a team, department, or governed AI program.

- [Enterprise overview](/enterprise): team workflows, governance, and capacity
- [Pricing](/pricing.md): plan tiers, limits, and enterprise evaluation rules
- [Security](/security): threat model and data boundaries
- [Privacy](/privacy): retention, attribution, and publication controls
- [Methodology](/methodology): aggregation, completeness, and ranking rules
- [Documentation](/docs): setup and telemetry guidance
- [Authentication](/auth.md): actual website and collector credential boundaries
- [Integrations](/integrations.md): HTTP, MCP, WebMCP, OpenTelemetry, and A2A paths
- [OpenAPI](/openapi.json): typed API contract and error schemas
- [Agent mode](/?mode=agent): machine-readable capabilities and limits
- [Contact](/contact): enterprise evaluation and support

UsageMax publishes bounded, content-free observability. Enterprise deployments can govern workspace membership, exports, attribution, retention, and capacity through a written agreement. Prompts, completions, source code, credentials, and private workspace data remain outside the public projection.
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
