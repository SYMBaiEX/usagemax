const llmsText = `# UsageMax

> UsageMax is a public observability layer for builders running serious AI systems. It turns reported model, tool, agent, and outcome telemetry into compact, bounded public projections.

<!-- title: UsageMax agent guide; canonical: https://usagemax.com/llms.txt; last-updated: 2026-09-16 -->

## When to use UsageMax

Use UsageMax when an agent or developer needs to read public aggregate AI-usage
statistics, compare public profiles, inspect model/source mix, or link a local
coding-agent history to one account. Use the CLI for local history collection;
use the public HTTP API for read-only profile/network data; use the MCP surface
for tool-capable clients. Do not use UsageMax to transmit prompts, completions,
source code, credentials, or private workspace data.

## Public pages

- [Home](https://usagemax.com/): product overview and realtime network signal
- [Leaderboard](https://usagemax.com/leaderboard): ranked public profiles by tokens or indexed spend
- [Documentation](https://usagemax.com/docs): native telemetry and OpenTelemetry ingestion
- [Methodology](https://usagemax.com/methodology): aggregation, completeness, and ranking definitions
- [Security](https://usagemax.com/security): public data boundaries and bounded reads
- [Enterprise](https://usagemax.com/enterprise): team operating surface
- [Privacy](https://usagemax.com/privacy): telemetry and public profile handling
- [Terms](https://usagemax.com/terms): public service terms
- [About](https://usagemax.com/about): product and operating boundary
- [Contact](https://usagemax.com/contact): support and enterprise contact
- [Authentication](https://usagemax.com/auth.md): actual website and collector credential flow
- [OpenAPI](https://usagemax.com/openapi.json): machine-readable HTTP contract
- [API context](https://usagemax.com/api/llms.txt): scoped API guidance
- [Documentation context](https://usagemax.com/docs/llms.txt): scoped documentation guidance
- [Agent mode](https://usagemax.com/?mode=agent): structured homepage capability view
- [NLWeb ask](https://usagemax.com/ask): bounded JSON or finite SSE answers about public UsageMax resources
- [A2A agent](https://usagemax.com/a2a): bounded JSON-RPC answers about public UsageMax resources
- [MCP](https://usagemax.com/mcp): read-only Streamable HTTP tools, when supported by the client
- [Documentation MCP](https://usagemax.com/docs-mcp): read-only documentation tools
- [Agent resource discovery](https://usagemax.com/.well-known/ard.json): public resource catalog
- [AI Catalog compatibility](https://usagemax.com/.well-known/ai-catalog.json): equivalent legacy discovery catalog
- [Agent skills index](https://usagemax.com/.well-known/agent-skills/index.json): published skill inventory
- [RFC 9727 API catalog](https://usagemax.com/.well-known/api-catalog): API linkset
- [Protected-resource metadata](https://usagemax.com/.well-known/oauth-protected-resource): collector authentication metadata
- [CLI package](https://www.npmjs.com/package/usagemax): installable local collector

## Source and agent distribution

- [UsageMax source repository](https://github.com/SYMBaiEX/usagemax): canonical open-source implementation
- [Agent rules](https://github.com/SYMBaiEX/usagemax/blob/main/AGENTS.md): contributor and runtime guidance
- [Agent Plugin manifest](https://github.com/SYMBaiEX/usagemax/blob/main/plugin.json): installable plugin metadata
- [Usage observability skill](https://raw.githubusercontent.com/SYMBaiEX/usagemax/main/skills/usage-observability/SKILL.md): public-data integration guidance
- [Enterprise reporting skill](https://raw.githubusercontent.com/SYMBaiEX/usagemax/main/skills/enterprise-reporting/SKILL.md): tenant-safe reporting guidance

## Public data contract

The public UI reads bounded Convex projections for network totals, leaderboard entries, public profile totals and model mix, daily rollups, active agents, and a short live event window. It does not expose prompts, completions, credentials, or raw unbounded event history.

## Ingestion

Telemetry can be sent to the native endpoint at /api/v1/telemetry/llm or the OpenTelemetry traces endpoint at /api/v1/traces. Send only metadata intended for processing; do not send secrets or prompt content. Use /api/v1/sandbox for no-write validation before sending a collector request.

## Authentication and limits

Public reads do not require authentication and return bounded Convex projections.
Collector writes require a one-time link followed by a write-only per-installation
bearer token and the x-usagemax-device-id header; the token is never accepted in a URL or
request body. The CLI sends bounded idempotent batches. API consumers should read
the OpenAPI contract for current request sizes and error codes. UsageMax does not
currently offer a general-purpose OAuth token exchange for API delegation; do not
invent one. Sign-in uses WorkOS AuthKit for the website account session.

## Freshness and privacy

Public projections are eventually updated after collector processing. A local
collector performs a one-shot sync; optional OS scheduling is opt-in and runs the
same short-lived sync periodically. It is not live telemetry and does not keep a
filesystem watcher resident.
`;

export function GET() {
  return new Response(llmsText, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
