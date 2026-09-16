import { describe, expect, it } from "vitest";
import { GET, HEAD } from "./route";

describe("authorization-server metadata markdown twin", () => {
  it("returns a heading-led, frontmatter-enabled markdown contract", async () => {
    const response = GET();
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(body).toMatch(/^---\ntitle: UsageMax authorization-server metadata/);
    expect(body).toContain("https://usagemax.com/auth/start");
    expect(body).toContain("general-purpose API access token");
    expect(body).not.toContain("<html");
  });

  it("supports a cacheable HEAD request", () => {
    const response = HEAD();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
  });
});
