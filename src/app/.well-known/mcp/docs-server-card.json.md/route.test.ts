import { describe, expect, it } from "vitest";
import { GET, HEAD } from "./route";

describe("documentation MCP server-card markdown twin", () => {
  it("returns a heading-led, frontmatter-enabled markdown contract", async () => {
    const response = GET();
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(body).toMatch(/^---\ntitle: UsageMax documentation MCP server card/);
    expect(body).toContain("# UsageMax documentation MCP server");
    expect(body).toContain("docs_search");
    expect(body).not.toContain("<html");
  });

  it("supports a cacheable HEAD request", () => {
    const response = HEAD();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
  });
});
