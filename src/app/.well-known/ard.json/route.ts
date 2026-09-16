const origin = "https://usagemax.com";

const manifest = {
  entries: [
    {
      "@context": "https://agenticresourcediscovery.org/context/v1",
      identifier: "urn:air:usagemax.com:resource:documentation",
      displayName: "UsageMax documentation",
      type: "text/html",
      url: `${origin}/docs`,
      description: "Documentation for UsageMax public telemetry, local collection, and privacy boundaries.",
      capabilities: ["documentation", "usage-telemetry"],
      representativeQueries: [
        "How does UsageMax collect AI usage locally?",
        "What data does UsageMax publish?",
      ],
    },
    {
      "@context": "https://agenticresourcediscovery.org/context/v1",
      identifier: "urn:air:usagemax.com:resource:api-catalog",
      displayName: "UsageMax API catalog",
      type: "application/linkset+json",
      url: `${origin}/.well-known/api-catalog`,
      description: "A linkset that points agents to the public OpenAPI contract and supported ingestion endpoints.",
      capabilities: ["api-discovery", "openapi"],
      representativeQueries: [
        "Where is the UsageMax API schema?",
        "How can a linked collector upload usage telemetry?",
      ],
    },
    {
      "@context": "https://agenticresourcediscovery.org/context/v1",
      identifier: "urn:air:usagemax.com:mcp:public-read",
      displayName: "UsageMax public read MCP",
      type: "application/mcp-server-card+json",
      url: `${origin}/.well-known/mcp/server-card.json`,
      description: "A stateless, unauthenticated, read-only MCP server for bounded public UsageMax projections and documentation.",
      capabilities: ["mcp", "public-usage", "documentation-search"],
      representativeQueries: [
        "Show UsageMax network usage statistics.",
        "Look up a public UsageMax profile.",
      ],
    },
    {
      "@context": "https://agenticresourcediscovery.org/context/v1",
      identifier: "urn:air:usagemax.com:resource:openapi",
      displayName: "UsageMax OpenAPI contract",
      type: "application/vnd.oai.openapi+json",
      url: `${origin}/openapi.json`,
      description: "Machine-readable contract for public reads and authenticated content-free collector writes.",
      capabilities: ["openapi", "api-contract"],
      representativeQueries: [
        "What UsageMax API operations are available?",
        "What headers are required for collector ingestion?",
      ],
    },
    {
      "@context": "https://agenticresourcediscovery.org/context/v1",
      identifier: "urn:air:usagemax.com:resource:cli",
      displayName: "UsageMax CLI",
      type: "application/vnd.npm.install-v1+json",
      url: "https://www.npmjs.com/package/usagemax",
      description: "A lightweight one-shot local collector for supported coding-agent usage histories.",
      capabilities: ["cli", "local-usage-sync", "scheduled-sync"],
      representativeQueries: [
        "How do I link a computer to UsageMax from a terminal?",
        "How do I run a lightweight scheduled UsageMax sync?",
      ],
    },
    {
      "@context": "https://agenticresourcediscovery.org/context/v1",
      identifier: "urn:air:usagemax.com:resource:agent-skills",
      displayName: "UsageMax Agent Skills",
      type: "application/json",
      url: `${origin}/.well-known/agent-skills/index.json`,
      description: "Installable UsageMax skills for public usage observability and enterprise reporting design.",
      capabilities: ["agent-skills", "usage-observability", "enterprise-reporting"],
      representativeQueries: [
        "How should an agent read UsageMax public stats?",
        "What are UsageMax enterprise data boundaries?",
      ],
    },
  ],
};

export function GET() {
  return Response.json(manifest, {
    headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=3600" },
  });
}

export function HEAD() {
  return new Response(null, {
    headers: {
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=3600",
      "content-type": "application/json; charset=utf-8",
    },
  });
}
