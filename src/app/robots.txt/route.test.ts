import { describe, expect, it } from "vitest";
import { GET, HEAD } from "./route";

describe("robots discovery directives", () => {
  it("advertises the sitemap, ARD agentmap, and schema map", async () => {
    const body = await (await GET()).text();
    expect(body).toContain("Agentmap: https://usagemax.com/.well-known/ard.json");
    expect(body).toContain("Sitemap: https://usagemax.com/sitemap.xml");
    expect(body).toContain("schemamap: https://usagemax.com/schemamap.xml");
  });

  it("supports a cacheable HEAD response", () => {
    expect(HEAD().status).toBe(200);
    expect(HEAD().headers.get("content-type")).toContain("text/plain");
  });
});
