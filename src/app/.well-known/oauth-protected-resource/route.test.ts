import { describe, expect, it } from "vitest";
import { GET, HEAD } from "./route";

describe("protected resource metadata", () => {
  it("points to the truthful auth walkthrough without inventing OAuth", async () => {
    const response = GET();
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    const metadata = await response.json();
    expect(metadata.resource).toBe("https://usagemax.com/api");
    expect(metadata.resource_documentation).toBe("https://usagemax.com/auth.md");
    expect(metadata.bearer_methods_supported).toEqual(["header"]);
    expect(metadata.scopes_supported).toEqual(["telemetry:write", "outcomes:write"]);
    expect(metadata.x_usagemax_authentication.collector_scopes).toEqual(["telemetry:write", "outcomes:write"]);
    expect(metadata.x_usagemax_authentication.oauth_delegation).toBe(false);
    expect(metadata.authorization_servers).toEqual(["https://usagemax.com"]);
    expect(metadata).not.toHaveProperty("token_endpoint");
  });

  it("supports metadata discovery HEAD requests", () => {
    const response = HEAD();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
  });
});
