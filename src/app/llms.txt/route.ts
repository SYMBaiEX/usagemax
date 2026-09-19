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
- [Pricing](https://usagemax.com/pricing): free personal and small-team plans, plus scoped enterprise capacity
- [Privacy](https://usagemax.com/privacy): telemetry and public profile handling
- [Terms](https://usagemax.com/terms): public service terms
- [About](https://usagemax.com/about): product and operating boundary
- [Contact](https://usagemax.com/contact): support and enterprise contact
- [Authentication](https://usagemax.com/auth.md): actual website and collector credential flow
- [OpenAPI](https://usagemax.com/openapi.json): machine-readable HTTP contract
- [API context](https://usagemax.com/api/llms.txt): scoped API guidance
- [Documentation context](https://usagemax.com/docs/llms.txt): scoped documentation guidance
- [Agent mode](https://usagemax.com/?mode=agent): public JSON capability view for the homepage
- [NLWeb ask](https://usagemax.com/ask): bounded JSON or finite SSE answers about public UsageMax resources
- [A2A agent](https://usagemax.com/a2a): bounded JSON-RPC answers about public UsageMax resources
- [MCP](https://usagemax.com/mcp): read-only Streamable HTTP tools, when supported by the client
- [Documentation MCP](https://usagemax.com/docs-mcp): read-only documentation tools
- [Documentation MCP card](https://usagemax.com/.well-known/mcp/docs-server-card.json): documentation-server identity and tool contract
- [WebMCP guide](https://usagemax.com/webmcp): in-page tools registered through the current document.modelContext API
- [MCP Registry listing](https://registry.modelcontextprotocol.io/v0.1/servers/io.github.SYMBaiEX%2Fusagemax/versions/latest): official active listing for the public MCP remote
- [MCP Registry metadata](https://raw.githubusercontent.com/SYMBaiEX/usagemax/main/server.json): versioned source metadata for the published listing
- [Agent resource discovery](https://usagemax.com/.well-known/ard.json): public resource catalog
- [AI Catalog compatibility](https://usagemax.com/.well-known/ai-catalog.json): equivalent legacy discovery catalog
- [Agent skills index](https://usagemax.com/.well-known/agent-skills/index.json): published skill inventory
- [RFC 9727 API catalog](https://usagemax.com/.well-known/api-catalog): API linkset
- [Protected-resource metadata](https://usagemax.com/.well-known/oauth-protected-resource): collector authentication metadata
- [Authorization-server metadata](https://usagemax.com/.well-known/oauth-authorization-server): browser-session authorization entry point; no API token exchange
- [HTTP Message Signatures directory](https://usagemax.com/.well-known/http-message-signatures-directory): public Web Bot Auth key discovery; signatures are not required by UsageMax today
- [CLI package](https://www.npmjs.com/package/usagemax): installable local collector
- [CLI guide](https://usagemax.com/cli.md): install, link, sync, and low-priority scheduling
- [API versioning](https://usagemax.com/api-versioning.md): compatibility and deprecation policy

## Source and agent distribution

- [UsageMax source repository](https://github.com/SYMBaiEX/usagemax): canonical open-source implementation
- [Agent rules](https://github.com/SYMBaiEX/usagemax/blob/main/AGENTS.md): contributor and runtime guidance
- [Agent Plugin manifest](https://github.com/SYMBaiEX/usagemax/blob/main/plugin.json): installable plugin metadata
- [Agent Plugin manifest on UsageMax](https://usagemax.com/plugin.json): machine-readable plugin metadata served by the canonical domain
- [skills.sh](https://www.skills.sh/): public agent-skills directory and CLI documentation
- [Usage observability skill](https://raw.githubusercontent.com/SYMBaiEX/usagemax/main/skills/usage-observability/SKILL.md): public-data integration guidance
- [Enterprise reporting skill](https://raw.githubusercontent.com/SYMBaiEX/usagemax/main/skills/enterprise-reporting/SKILL.md): tenant-safe reporting guidance

Install a selected source skill from the default branch with
\`npx skills add SYMBaiEX/usagemax --skill usage-observability\`,
\`npx skills add SYMBaiEX/usagemax --skill enterprise-reporting\`, or
\`npx skills add SYMBaiEX/usagemax --skill collector-diagnostics\`. The local
files and digest-pinned index are the source inventory. The public directory
currently indexes [usage-observability](https://www.skills.sh/symbaiex/usagemax/usage-observability),
[enterprise-reporting](https://www.skills.sh/symbaiex/usagemax/enterprise-reporting), and
[collector-diagnostics](https://www.skills.sh/symbaiex/usagemax/collector-diagnostics).
Its automated security audit is external and can change independently; inspect
the source before installing.

Install the collector with \`bunx usagemax@latest --help\`,
\`npm exec --yes usagemax@latest -- --help\`, or
\`npm install --global usagemax\` followed by \`usagemax --help\`. The
collector is a short-lived local process; its package release and the website
release are versioned independently.

## Agent mode

Request \`GET https://usagemax.com/?mode=agent\` for the public JSON capability
index. It describes the currently advertised read-only endpoints, resources,
protocols, limits, authentication boundaries, and excluded private data. It does
not require authentication and does not mint OAuth tokens. Use the linked
OpenAPI and resource documents for request and response schemas.

UsageMax also exposes four bounded, read-only WebMCP tools in the page when the
browser provides \`document.modelContext.registerTool()\`. Registration uses an
AbortSignal for cleanup; \`navigator.modelContext\` is retained only as a legacy
preview fallback. See the [WebMCP guide](https://usagemax.com/webmcp).

## Getting started

1. Create an account at [UsageMax sign-up](https://usagemax.com/sign-up).
2. In [Account](https://usagemax.com/account), create a one-use computer link.
3. Run \`bunx usagemax@latest link UMX-XXXX-XXXX-XXXX-XXXX\`, then run
   \`bunx usagemax@latest sync\` for a bounded one-shot upload.

Personal and small-team plans are free, and no card is required. Public profile
publication is optional; prompts, completions, source code, credentials, and
private workspace data remain outside the public projection.

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
