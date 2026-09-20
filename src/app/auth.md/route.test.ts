import { describe, expect, it } from "vitest";
import { GET, HEAD } from "./route";

describe("auth.md", () => {
  it("documents the WorkOS delegated OAuth and collector paths", async () => {
    const body = await (GET() as Response).text();
    expect(body.startsWith("# UsageMax authentication\n")).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(200);
    expect(body).toContain("# UsageMax authentication");
    expect(body).toContain("title: UsageMax authentication");
    expect(body).toContain("description: WorkOS delegated OAuth, agent registration, and installation-bound collector credentials.");
    expect(body).toContain("canonical: https://usagemax.com/auth.md");
    expect(body).toContain("last-updated: 2026-09-19");
    expect(body).toContain("https://usagemax.com/sign-in");
    expect(body).toContain("https://usagemax.com/account");
    expect(body).toContain("https://usagemax.com/api/v1/devices/link");
    expect(body).toContain("WorkOS delegated OAuth");
    expect(body).toContain("/oauth2/authorize");
    expect(body).toContain("/oauth2/token");
    expect(body).toContain("Agent Registration");
    expect(body).toContain("https://usagemax.com/.well-known/oauth-protected-resource");
    expect(body).toContain("CLI `0.3.7`");
  });

  it("serves markdown for GET and HEAD", () => {
    expect(GET().headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(GET().headers.get("link")).toBe('<https://usagemax.com/auth.md>; rel="canonical"');
    expect(GET().headers.get("vary")).toBe("Accept, User-Agent");
    expect(GET().headers.get("x-content-type-options")).toBe("nosniff");
    expect(HEAD().headers.get("link")).toBe('<https://usagemax.com/auth.md>; rel="canonical"');
    expect(HEAD().status).toBe(200);
  });
});
