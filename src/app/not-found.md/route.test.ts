import { describe, expect, it } from "vitest";
import { GET, HEAD } from "./route";

describe("markdown not-found recovery", () => {
  it("returns a real 404 with bounded recovery links", async () => {
    const response = GET();
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    const body = await response.text();
    expect(body).toContain("https://usagemax.com/sitemap.xml");
    expect(body).toContain("https://usagemax.com/llms.txt");
  });

  it("supports markdown HEAD requests", () => {
    const response = HEAD();
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
  });
});
