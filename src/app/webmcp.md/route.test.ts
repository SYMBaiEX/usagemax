import { describe, expect, it } from "vitest";
import { GET, HEAD } from "./route";

describe("WebMCP guide", () => {
  it("documents the normative document registration path and bounded tools", async () => {
    const body = await GET().text();
    expect(body).toContain("# UsageMax WebMCP");
    expect(body).toContain("document.modelContext.registerTool");
    expect(body).toContain("usagemax_network_stats");
    expect(body).toContain("AbortSignal");
  });

  it("supports cacheable metadata HEAD requests", () => {
    expect(HEAD().status).toBe(200);
    expect(HEAD().headers.get("content-type")).toBe("text/markdown; charset=utf-8");
  });
});
