import { describe, expect, it } from "vitest";
import { GET, HEAD } from "./route";

describe("auth.md", () => {
  it("documents the traversable collector path and explicit OAuth boundary", async () => {
    const body = await (GET() as Response).text();
    expect(body).toContain("https://usagemax.com/sign-in");
    expect(body).toContain("https://usagemax.com/account");
    expect(body).toContain("https://usagemax.com/api/v1/devices/link");
    expect(body).toContain("authorization-server metadata");
    expect(body).toContain("does not expose an OAuth token exchange");
    expect(body).toContain("no `identity_endpoint`, `claim_endpoint`, `events_endpoint`");
    expect(body).toContain("https://usagemax.com/.well-known/oauth-protected-resource");
    expect(body).toContain("CLI `0.3.6`");
  });

  it("serves markdown for GET and HEAD", () => {
    expect(GET().headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(HEAD().status).toBe(200);
  });
});
