import { describe, expect, test } from "vitest";

import { GET } from "./route";

describe("/llms.txt", () => {
  test("documents the public agent-mode contract and free onboarding path", async () => {
    const response = GET();
    const body = await response.text();

    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(body).toContain("https://usagemax.com/?mode=agent");
    expect(body).toContain("https://usagemax.com/.well-known/oauth-authorization-server");
    expect(body).toContain("https://usagemax.com/.well-known/mcp/docs-server-card.json");
    expect(body).toContain("public JSON capability");
    expect(body).toContain("does not mint OAuth tokens");
    expect(body).toContain("Personal and small-team plans are free");
    expect(body).toContain("no card is required");
    expect(body).toContain("bunx usagemax@latest link");
  });
});
