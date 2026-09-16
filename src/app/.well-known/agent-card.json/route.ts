export const dynamic = "force-static";

const card = {
  name: "UsageMax public observability agent",
  description: "A bounded, read-only A2A agent for answering questions about UsageMax public usage projections, integrations, and privacy boundaries.",
  supportedInterfaces: [{ url: "https://usagemax.com/a2a", protocolBinding: "JSONRPC", protocolVersion: "1.0" }],
  provider: { organization: "UsageMax", url: "https://usagemax.com/about" },
  version: "1.0.0",
  documentationUrl: "https://usagemax.com/docs",
  capabilities: { streaming: false, pushNotifications: false, extendedAgentCard: false },
  securitySchemes: {},
  securityRequirements: [],
  defaultInputModes: ["text/plain"],
  defaultOutputModes: ["text/plain", "application/json"],
  skills: [{
    id: "public-usage-observability",
    name: "Read public UsageMax data",
    description: "Answer bounded questions using public UsageMax aggregate usage, documentation, integration, and privacy resources.",
    tags: ["usage", "telemetry", "observability", "documentation", "privacy"],
    examples: ["How does UsageMax count tokens?", "What data does UsageMax expose publicly?"],
    inputModes: ["text/plain"],
    outputModes: ["text/plain", "application/json"],
    securityRequirements: [],
  }],
  iconUrl: "https://usagemax.com/brand/icon-192.png",
};

export function GET() {
  return Response.json(card, { headers: { "cache-control": "public, max-age=3600" } });
}

export function HEAD() {
  return new Response(null, { headers: { "cache-control": "public, max-age=3600", "content-type": "application/json; charset=utf-8" } });
}
