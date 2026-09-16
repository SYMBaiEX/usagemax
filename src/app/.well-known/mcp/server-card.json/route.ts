import { MCP_APP_RESOURCES, MCP_PROTOCOL_VERSION, MCP_SERVER_INSTRUCTIONS, MCP_SERVER_NAMES, MCP_SERVER_VERSION, USAGEMAX_TOOLS } from "@/lib/mcp/server";

export const dynamic = "force-static";

export function GET() {
  return Response.json({
    name: MCP_SERVER_NAMES.public,
    version: MCP_SERVER_VERSION,
    protocolVersion: MCP_PROTOCOL_VERSION,
    instructions: MCP_SERVER_INSTRUCTIONS.public,
    description: "Stateless, unauthenticated, read-only MCP Streamable HTTP tools for bounded public UsageMax projections.",
    serverUrl: "https://usagemax.com/mcp",
    icon: "https://usagemax.com/brand/icon-192.png",
    transport: "streamable-http",
    tools: USAGEMAX_TOOLS.map(({ name, title, description, inputSchema, annotations, _meta }) => ({ name, title, description, inputSchema, annotations, ...(_meta ? { _meta } : {}) })),
    resources: MCP_APP_RESOURCES,
    endpoints: [
      { url: "https://usagemax.com/mcp", methods: ["POST"], tools: USAGEMAX_TOOLS.map(({ name }) => name) },
    ],
    authentication: { schemes: [] },
    capabilities: { tools: { listChanged: false }, resources: { listChanged: false, subscribe: false }, prompts: false },
    documentationServer: "https://usagemax.com/docs-mcp",
    documentationServerCard: "https://usagemax.com/.well-known/mcp/docs-server-card.json",
    limitations: ["No mutations", "No private or account data", "No telemetry ingestion", "JSON responses only; no SSE streaming", "Request bodies capped at 64 KiB", "Origin validation is enforced when Origin is supplied"],
  }, { headers: { "cache-control": "public, max-age=300" } });
}
