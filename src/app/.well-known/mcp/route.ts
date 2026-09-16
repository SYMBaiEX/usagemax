export const dynamic = "force-static";

const discovery = {
  name: "UsageMax public read MCP",
  version: "1.0.0",
  protocol: "2025-06-18",
  transport: "streamable-http",
  serverUrl: "https://usagemax.com/mcp",
  serverCard: "https://usagemax.com/.well-known/mcp/server-card.json",
  documentationServerUrl: "https://usagemax.com/docs-mcp",
  documentationServerCard: "https://usagemax.com/.well-known/mcp/docs-server-card.json",
  authentication: { schemes: [] },
  readOnly: true,
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
