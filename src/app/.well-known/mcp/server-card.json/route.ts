import { DOC_TOOL_DEFINITIONS, MCP_SERVER_VERSION, USAGEMAX_TOOLS } from "@/lib/mcp/server";

export const dynamic = "force-static";

export function GET() {
  return Response.json({
    name: "UsageMax public read MCP",
    version: MCP_SERVER_VERSION,
    description: "Stateless, unauthenticated, read-only MCP Streamable HTTP surfaces for public UsageMax projections and bounded documentation.",
    serverUrl: "https://usagemax.com/mcp",
    transport: "streamable-http",
    tools: [...USAGEMAX_TOOLS, ...DOC_TOOL_DEFINITIONS].map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
    endpoints: [
      { url: "https://usagemax.com/mcp", methods: ["POST"], tools: USAGEMAX_TOOLS.map(({ name }) => name) },
      { url: "https://usagemax.com/docs-mcp", methods: ["POST"], tools: DOC_TOOL_DEFINITIONS.map(({ name }) => name) },
    ],
    authentication: { schemes: [] },
    capabilities: { tools: { listChanged: false }, resources: false, prompts: false },
    limitations: ["No mutations", "No private or account data", "No telemetry ingestion", "JSON responses only; no SSE streaming", "Request bodies capped at 64 KiB", "Origin validation is enforced when Origin is supplied"],
  }, { headers: { "cache-control": "public, max-age=300" } });
}
