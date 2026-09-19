import { describe, expect, it } from "vitest";
import { DOC_TOOL_DEFINITIONS, MCP_APP_RESOURCES, MCP_SERVER_BRANDING, MCP_SERVER_VERSION, USAGEMAX_TOOLS } from "@/lib/mcp/server";
import { GET as getProductCard } from "./route";
import { GET as getDocsCard } from "../docs-server-card.json/route";

const cardTools = (tools: typeof USAGEMAX_TOOLS | typeof DOC_TOOL_DEFINITIONS) => tools.map(({ name, title, description, inputSchema, outputSchema, annotations, ...tool }) => ({
  name,
  title,
  description,
  inputSchema,
  ...(outputSchema ? { outputSchema } : {}),
  annotations,
  ...(tool._meta ? { _meta: tool._meta } : {}),
}));

describe("MCP server cards", () => {
  it("keeps the public card synchronized with the product tool contract", async () => {
    const body = await getProductCard().json();
    expect(body).toMatchObject({ name: "UsageMax public observability", version: MCP_SERVER_VERSION, protocolVersion: "2025-06-18", instructions: expect.stringContaining("read-only"), serverUrl: "https://usagemax.com/mcp", transport: "streamable-http" });
    expect(body).toMatchObject(MCP_SERVER_BRANDING);
    expect(body.tools).toEqual(cardTools(USAGEMAX_TOOLS));
    expect(body.endpoints).toEqual([{ url: "https://usagemax.com/mcp", methods: ["POST"], tools: USAGEMAX_TOOLS.map(({ name }) => name) }]);
    expect(body.resources).toEqual(MCP_APP_RESOURCES);
  });

  it("keeps the documentation card synchronized with the docs tool contract", async () => {
    const body = await getDocsCard().json();
    expect(body).toMatchObject({ name: "UsageMax documentation MCP", version: MCP_SERVER_VERSION, protocolVersion: "2025-06-18", instructions: expect.stringContaining("documentation tools"), serverUrl: "https://usagemax.com/docs-mcp", transport: "streamable-http" });
    expect(body).toMatchObject(MCP_SERVER_BRANDING);
    expect(body.tools).toEqual(cardTools(DOC_TOOL_DEFINITIONS));
    expect(body.endpoints).toEqual([{ url: "https://usagemax.com/docs-mcp", methods: ["POST"], tools: DOC_TOOL_DEFINITIONS.map(({ name }) => name) }]);
  });
});
