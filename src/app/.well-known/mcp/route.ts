import { MCP_APP_RESOURCES, MCP_PROTOCOL_VERSION, MCP_SERVER_INSTRUCTIONS, MCP_SERVER_NAMES, MCP_SERVER_VERSION, USAGEMAX_TOOLS } from "@/lib/mcp/server";

export const dynamic = "force-static";

function toolMetadata(tool: { name: string; title: string; description: string; inputSchema: unknown; annotations: unknown; _meta?: unknown }) {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
    ...(tool._meta ? { _meta: tool._meta } : {}),
  };
}

const discovery = {
  schemaVersion: "1.0",
  type: "mcp-discovery",
  name: MCP_SERVER_NAMES.public,
  version: MCP_SERVER_VERSION,
  protocol: MCP_PROTOCOL_VERSION,
  instructions: MCP_SERVER_INSTRUCTIONS.public,
  transport: "streamable-http",
  serverUrl: "https://usagemax.com/mcp",
  serverCard: "https://usagemax.com/.well-known/mcp/server-card.json",
  documentationServerUrl: "https://usagemax.com/docs-mcp",
  documentationServerCard: "https://usagemax.com/.well-known/mcp/docs-server-card.json",
  authentication: { schemes: [] },
  readOnly: true,
  capabilities: { tools: { listChanged: false }, resources: { listChanged: false, subscribe: false } },
  tools: USAGEMAX_TOOLS.map(toolMetadata),
  resources: MCP_APP_RESOURCES,
  limitations: ["No mutations", "No private or account data", "No telemetry ingestion", "JSON responses only; no SSE streaming"],
};

const headers = {
  "access-control-allow-origin": "*",
  "cache-control": "public, max-age=300",
  "content-type": "application/json; charset=utf-8",
};

export function GET() {
  return new Response(JSON.stringify(discovery), { headers });
}

export function HEAD() {
  return new Response(null, { headers });
}
