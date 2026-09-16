import { MCP_SERVER_VERSION, USAGEMAX_TOOLS } from "@/lib/mcp/server";

export const dynamic = "force-static";

export function GET() {
  return Response.json({
    name: "UsageMax public product MCP",
    version: MCP_SERVER_VERSION,
    description: "Stateless, unauthenticated, read-only MCP Streamable HTTP tools for bounded public UsageMax projections.",
    serverUrl: "https://usagemax.com/mcp",
    icon: "https://usagemax.com/brand/icon-192.png",
    transport: "streamable-http",
    tools: USAGEMAX_TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations })),
    endpoints: [
      { url: "https://usagemax.com/mcp", methods: ["POST"], tools: USAGEMAX_TOOLS.map(({ name }) => name) },
    ],
    authentication: { schemes: [] },
    capabilities: { tools: { listChanged: false }, resources: false, prompts: false },
    documentationServer: "https://usagemax.com/docs-mcp",
    documentationServerCard: "https://usagemax.com/.well-known/mcp/docs-server-card.json",
    limitations: ["No mutations", "No private or account data", "No telemetry ingestion", "JSON responses only; no SSE streaming", "Request bodies capped at 64 KiB", "Origin validation is enforced when Origin is supplied"],
  }, { headers: { "cache-control": "public, max-age=300" } });
}
