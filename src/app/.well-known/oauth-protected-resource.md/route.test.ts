import { describe, expect, it } from "vitest";
import { GET, HEAD } from "./route";

describe("protected-resource metadata markdown twin", () => {
  it("is heading-led and states the WorkOS delegated and collector boundaries", async () => {
    const response = GET();
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("link")).toBe('<https://usagemax.com/.well-known/oauth-protected-resource>; rel="canonical"');
    expect(body).toMatch(/^---\ntitle: UsageMax protected resource/);
    expect(body).toContain("# UsageMax protected resource");
    expect(body).toContain("WorkOS owns the authorization server");
    expect(body).toContain("usage:read");
  });

  it("supports a metadata HEAD request", () => {
    const response = HEAD();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
  });
});
