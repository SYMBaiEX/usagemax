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
    expect(body).toContain("https://usagemax.com/symbiex.md");
    expect(body).toContain("https://usagemax.com/sign-in");
    expect(body).not.toContain("https://usagemax.com/account), create a one-use");
    expect(body).not.toContain("<handle>");
    expect(body).toContain("https://usagemax.com/ask?query=UsageMax");
    expect(body).toContain("POST `/mcp`");
    expect(body).toContain("https://raw.githubusercontent.com/SYMBaiEX/usagemax/main/server.json");
    expect(body).toContain("https://registry.modelcontextprotocol.io/v0.1/servers/io.github.SYMBaiEX%2Fusagemax/versions/latest");
    expect(body).toContain("https://www.skills.sh/");
    expect(body).toContain("npx skills add SYMBaiEX/usagemax --skill usage-observability");
    expect(body).toContain("npx skills add SYMBaiEX/usagemax --skill collector-diagnostics");
    expect(body).toContain("npm exec --yes usagemax@latest -- --help");
    expect(body).toContain("npm install --global usagemax");
    expect(body).toContain("The public directory");
    expect(body).toContain("https://www.skills.sh/symbaiex/usagemax/usage-observability");
    expect(body).toContain("public JSON capability");
    expect(body).toContain("does not mint OAuth tokens");
    expect(body).toContain("Personal and small-team plans are free");
    expect(body).toContain("no card is required");
    expect(body).toContain("bunx usagemax@latest link");
  });
});
