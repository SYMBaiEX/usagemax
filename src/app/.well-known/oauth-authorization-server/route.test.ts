import { describe, expect, it } from "vitest";
import { GET, HEAD } from "./route";

describe("authorization server metadata", () => {
  it("is reachable and describes the bounded website-session entry point", async () => {
    const response = GET();
    const metadata = await response.json();
    expect(response.status).toBe(200);
    expect(metadata.issuer).toBe("https://usagemax.com");
    expect(metadata.authorization_endpoint).toBe("https://usagemax.com/auth/start");
    expect(metadata.token_endpoint_auth_methods_supported).toEqual([]);
    expect(metadata.x_usagemax_authentication.oauth_delegation).toBe(false);
  });

  it("supports metadata HEAD requests", () => {
    expect(HEAD().status).toBe(200);
    expect(HEAD().headers.get("content-type")).toBe("application/json; charset=utf-8");
  });
});
