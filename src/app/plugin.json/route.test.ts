import { describe, expect, it } from "vitest";
import { GET, HEAD } from "./route";

describe("agent plugin manifest", () => {
  it("publishes the same public plugin identity as the repository manifest", async () => {
    const response = GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      name: "usagemax",
      version: "0.3.8",
      homepage: "https://usagemax.com",
      repository: "https://github.com/SYMBaiEX/usagemax",
      license: "MIT",
    });
    expect(body.keywords).toContain("mcp");
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("supports a cacheable HEAD request", () => {
    expect(HEAD().status).toBe(200);
    expect(HEAD().headers.get("content-type")).toContain("application/json");
  });
});
