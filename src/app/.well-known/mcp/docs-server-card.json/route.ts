import { DOC_TOOL_DEFINITIONS, MCP_SERVER_VERSION } from "@/lib/mcp/server";

export const dynamic = "force-static";

export function GET() {
  return Response.json({
    name: "UsageMax documentation MCP",
    version: MCP_SERVER_VERSION,
    description: "Stateless, unauthenticated, read-only MCP Streamable HTTP tools for bounded UsageMax documentation retrieval.",
    serverUrl: "https://usagemax.com/docs-mcp",
    icon: "https://usagemax.com/brand/icon-192.png",
    transport: "streamable-http",
    tools: DOC_TOOL_DEFINITIONS.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations })),
    endpoints: [{ url: "https://usagemax.com/docs-mcp", methods: ["POST"], tools: DOC_TOOL_DEFINITIONS.map(({ name }) => name) }],
    authentication: { schemes: [] },
    capabilities: { tools: { listChanged: false }, resources: false, prompts: false },
    limitations: ["No mutations", "No private or account data", "No telemetry ingestion", "JSON responses only; no SSE streaming", "Request bodies capped at 64 KiB", "Origin validation is enforced when Origin is supplied"],
  }, { headers: { "cache-control": "public, max-age=300" } });
}
