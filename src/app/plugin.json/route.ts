export const dynamic = "force-static";

const manifest = {
  $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  name: "usagemax",
  version: "0.3.8",
  description: "Read public UsageMax AI-usage projections through MCP and connect a local content-free collector through the usagemax CLI.",
  author: { name: "UsageMax", url: "https://usagemax.com" },
  homepage: "https://usagemax.com",
  repository: "https://github.com/SYMBaiEX/usagemax",
  license: "MIT",
  keywords: ["ai-usage", "observability", "tokens", "telemetry", "cli", "mcp", "agent-skills"],
};

const headers = {
  "access-control-allow-origin": "*",
  "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
};

export function GET() {
  return Response.json(manifest, { headers });
}

export function HEAD() {
  return new Response(null, { headers });
}
