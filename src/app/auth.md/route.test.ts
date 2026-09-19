import { describe, expect, it } from "vitest";
import { GET, HEAD } from "./route";

describe("auth.md", () => {
  it("documents the traversable collector path and explicit OAuth boundary", async () => {
    const body = await (GET() as Response).text();
    expect(body.trimStart().startsWith("# UsageMax authentication")).toBe(true);
    expect(body).toContain("# UsageMax authentication");
    expect(body).toContain("title: UsageMax authentication");
    expect(body).toContain("description: The credentials and supported authentication boundaries for UsageMax.");
    expect(body).toContain("canonical: https://usagemax.com/auth.md");
    expect(body).toContain("last-updated: 2026-09-19");
    expect(body).toContain("https://usagemax.com/sign-in");
    expect(body).toContain("https://usagemax.com/account");
    expect(body).toContain("https://usagemax.com/api/v1/devices/link");
    expect(body).toContain("authentication metadata");
    expect(body).toContain("does not expose an OAuth authorization or token exchange");
    expect(body).toContain("no `authorization_endpoint`, `token_endpoint`, `identity_endpoint`");
    expect(body).toContain("https://usagemax.com/.well-known/oauth-protected-resource");
    expect(body).toContain("CLI `0.3.6`");
  });

  it("serves markdown for GET and HEAD", () => {
    expect(GET().headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(GET().headers.get("link")).toBe('<https://usagemax.com/auth.md>; rel="canonical"');
    expect(HEAD().headers.get("link")).toBe('<https://usagemax.com/auth.md>; rel="canonical"');
    expect(HEAD().status).toBe(200);
  });
});
