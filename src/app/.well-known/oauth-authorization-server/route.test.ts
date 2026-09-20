import { describe, expect, it } from "vitest";
import { GET, HEAD } from "./route";

describe("authorization server metadata", () => {
  it("is reachable and delegates OAuth to the configured WorkOS Connect issuer", async () => {
    const response = await GET();
    const metadata = await response.json();
    expect(response.status).toBe(200);
    expect(metadata.issuer).toContain("authkit.app");
    expect(metadata.authorization_endpoint).toContain("/oauth2/authorize");
    expect(metadata.token_endpoint).toContain("/oauth2/token");
    expect(metadata.jwks_uri).toContain("/oauth2/jwks");
    expect(metadata.x_usagemax_authentication.browser_sign_in_endpoint).toBe("https://usagemax.com/sign-in");
    expect(metadata.x_usagemax_authentication.oauth_delegation).toBe("workos_connect");
  });

  it("supports metadata HEAD requests", () => {
    expect(HEAD().status).toBe(200);
    expect(HEAD().headers.get("content-type")).toBe("application/json; charset=utf-8");
  });
});
