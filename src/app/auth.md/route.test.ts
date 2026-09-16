import { describe, expect, it } from "vitest";
import { GET, HEAD } from "./route";

describe("auth.md", () => {
  it("documents the traversable collector path and explicit OAuth boundary", async () => {
    const body = await (GET() as Response).text();
    expect(body).toContain("https://usagemax.com/sign-in");
    expect(body).toContain("https://usagemax.com/account");
    expect(body).toContain("https://usagemax.com/api/v1/devices/link");
    expect(body).toContain("no OAuth authorization-server exchange or token endpoint");
    expect(body).toContain("no `authorization_servers`, `authorization_endpoint`, or `token_endpoint`");
    expect(body).toContain("https://usagemax.com/.well-known/oauth-protected-resource");
  });

  it("serves markdown for GET and HEAD", () => {
    expect(GET().headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(HEAD().status).toBe(200);
  });
});
