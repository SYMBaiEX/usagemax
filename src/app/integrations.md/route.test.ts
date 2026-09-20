import { describe, expect, it } from "vitest";
import { GET, HEAD } from "./route";

describe("integrations markdown route", () => {
  it("publishes a discoverable integrations contract", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/markdown");
    const body = await response.text();
    expect(body).toContain("canonical: https://usagemax.com/integrations");
    expect(body).toContain("[HTTP API](/openapi.json)");
    expect(body).toContain("[MCP](/mcp)");
    expect(body).toContain("[Local collector](/cli.md)");
    expect(body).toContain("Delegated clients use WorkOS Connect");
  });

  it("supports a bodyless HEAD response", async () => {
    expect((await HEAD()).body).toBeNull();
  });
});
