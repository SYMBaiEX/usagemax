const origin = "https://usagemax.com";

const trustManifest = {
  identity: { type: "web-origin", url: origin },
  attestations: [{ type: "source-repository", url: "https://github.com/SYMBaiEX/usagemax" }],
};

export const manifest = {
  specVersion: "0.91",
  icon: `${origin}/brand/icon-192.png`,
  entries: [
    {
      "@context": "https://agenticresourcediscovery.org/context/v1",
      identifier: "urn:air:usagemax.com:resource:documentation",
      displayName: "UsageMax documentation",
      type: "text/html",
      url: `${origin}/docs`,
      trustManifest,
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
      trustManifest,
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
      trustManifest,
      description: "A stateless, unauthenticated, read-only MCP server for bounded public UsageMax projections, documentation, and an optional inline observability view.",
      capabilities: ["mcp", "mcp-apps", "public-usage", "documentation-search"],
      representativeQueries: [
        "Show UsageMax network usage statistics.",
        "Look up a public UsageMax profile.",
      ],
    },
    {
      "@context": "https://agenticresourcediscovery.org/context/v1",
      identifier: "urn:air:usagemax.com:a2a:public-observability",
      displayName: "UsageMax public observability A2A agent",
      type: "application/a2a+json",
      url: `${origin}/a2a`,
      trustManifest,
      description: "A bounded JSON-RPC A2A interface that answers questions about public UsageMax usage, integrations, and privacy boundaries.",
      capabilities: ["a2a", "public-usage", "read-only"],
      representativeQueries: [
        "How does UsageMax count tokens?",
        "What does UsageMax expose publicly?",
      ],
    },
    {
      "@context": "https://agenticresourcediscovery.org/context/v1",
      identifier: "urn:air:usagemax.com:resource:openapi",
      displayName: "UsageMax OpenAPI contract",
      type: "application/vnd.oai.openapi+json",
      url: `${origin}/openapi.json`,
      trustManifest,
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
      trustManifest,
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
      trustManifest,
      description: "Installable UsageMax skills for public usage observability and enterprise reporting design.",
      capabilities: ["agent-skills", "usage-observability", "enterprise-reporting"],
      representativeQueries: [
        "How should an agent read UsageMax public stats?",
        "What are UsageMax enterprise data boundaries?",
      ],
    },
    {
      "@context": "https://agenticresourcediscovery.org/context/v1",
      identifier: "urn:air:usagemax.com:a2a:agent-card",
      displayName: "UsageMax A2A agent card",
      type: "application/json",
      url: `${origin}/.well-known/agent-card.json`,
      trustManifest,
      description: "A2A discovery metadata for the bounded UsageMax public observability agent.",
      capabilities: ["a2a-discovery", "agent-card"],
      representativeQueries: ["Where is the UsageMax A2A agent card?"],
    },
    {
      "@context": "https://agenticresourcediscovery.org/context/v1",
      identifier: "urn:air:usagemax.com:mcp:documentation",
      displayName: "UsageMax documentation MCP",
      type: "application/mcp-server-card+json",
      url: `${origin}/.well-known/mcp/docs-server-card.json`,
      trustManifest,
      description: "A read-only MCP server for bounded UsageMax documentation search and retrieval.",
      capabilities: ["mcp", "documentation-search"],
      representativeQueries: ["Search UsageMax documentation."],
    },
    {
      "@context": "https://agenticresourcediscovery.org/context/v1",
      identifier: "urn:air:usagemax.com:resource:public-query",
      displayName: "UsageMax public query endpoint",
      type: "application/json",
      url: `${origin}/ask`,
      trustManifest,
      description: "A bounded natural-language query endpoint that answers from first-party public UsageMax resources and returns citations.",
      capabilities: ["public-query", "citations", "nlweb"],
      representativeQueries: ["How does UsageMax count tokens?"],
    },
    {
      "@context": "https://agenticresourcediscovery.org/context/v1",
      identifier: "urn:air:usagemax.com:resource:schema-feed",
      displayName: "UsageMax schema feed",
      type: "application/jsonl",
      url: `${origin}/schema-feed.jsonl`,
      trustManifest,
      description: "A JSON Lines feed of the public UsageMax schema entities for machine-readable indexing.",
      capabilities: ["schema", "json-ld", "entity-discovery"],
      representativeQueries: ["What structured entities does UsageMax publish?"],
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
