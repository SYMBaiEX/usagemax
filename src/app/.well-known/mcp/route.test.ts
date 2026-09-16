import { describe, expect, it } from "vitest";
import { GET, HEAD } from "./route";

describe("MCP discovery metadata", () => {
  it("exposes the same bounded tools as the live product server", async () => {
    const body = await GET().json();
    expect(body).toMatchObject({ type: "mcp-discovery", serverUrl: "https://usagemax.com/mcp", readOnly: true });
    expect(body.tools.map((tool: { name: string }) => tool.name)).toEqual(["public_profile", "leaderboard", "network_stats", "ask_site"]);
    expect(body.documentationTools.map((tool: { name: string }) => tool.name)).toEqual(["docs_list", "docs_search", "docs_get"]);
    expect(body.resources[0].uri).toBe("ui://usagemax/public-observability.html");
  });

  it("supports cacheable metadata HEAD requests", () => {
    expect(HEAD().status).toBe(200);
    expect(HEAD().headers.get("content-type")).toBe("application/json; charset=utf-8");
  });
});
