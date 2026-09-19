import { describe, expect, it } from "vitest";
import { GET, HEAD } from "./route";

describe("authorization server metadata", () => {
  it("is reachable and describes the bounded website-session entry point", async () => {
    const response = GET();
    const metadata = await response.json();
    expect(response.status).toBe(200);
    expect(metadata.issuer).toBe("https://usagemax.com");
    expect(metadata.x_usagemax_authentication.browser_sign_in_endpoint).toBe("https://usagemax.com/sign-in");
    expect(metadata).not.toHaveProperty("authorization_endpoint");
    expect(metadata).not.toHaveProperty("token_endpoint");
    expect(metadata).not.toHaveProperty("response_types_supported");
    expect(metadata.x_usagemax_authentication.oauth_delegation).toBe(false);
  });

  it("supports metadata HEAD requests", () => {
    expect(HEAD().status).toBe(200);
    expect(HEAD().headers.get("content-type")).toBe("application/json; charset=utf-8");
  });
});
