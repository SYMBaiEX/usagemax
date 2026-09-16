import serverMetadata from "../../server.json";
import { agentHomepage } from "./agent-index";
import { describe, expect, it } from "vitest";

describe("local MCP Registry metadata", () => {
  it("describes the published public remote without implying a package", () => {
    expect(serverMetadata).toMatchObject({
      "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
      name: "io.github.SYMBaiEX/usagemax",
      repository: { url: "https://github.com/SYMBaiEX/usagemax", source: "github" },
      version: "1.0.0",
      websiteUrl: "https://usagemax.com",
      icons: [{ src: "https://usagemax.com/brand/icon-192.png", mimeType: "image/png", sizes: ["192x192"] }],
      remotes: [{ type: "streamable-http", url: "https://usagemax.com/mcp" }],
    });
    expect(serverMetadata).not.toHaveProperty("packages");
  });
});

describe("agent authentication metadata", () => {
  it("states the real browser boundary without claiming OAuth delegation", () => {
    expect(agentHomepage().authentication).toMatchObject({
      browserSignIn: "https://usagemax.com/auth/start",
      oauthDelegation: false,
    });
  });
});

describe("agent resource links", () => {
  it("exposes predictable first-party and source-controlled developer resources", () => {
    const index = agentHomepage();
    expect(index.developerResources).toEqual(expect.arrayContaining([
      { name: "agentResourceDiscovery", url: "https://usagemax.com/.well-known/ard.json", mediaType: "application/json" },
      { name: "agentSkills", url: "https://usagemax.com/.well-known/agent-skills/index.json", mediaType: "application/json" },
      { name: "agentPlugin", url: "https://raw.githubusercontent.com/SYMBaiEX/usagemax/main/plugin.json", mediaType: "application/json" },
      { name: "cliGuide", url: "https://usagemax.com/cli.md", mediaType: "text/markdown" },
    ]));
    expect(index.discovery.plugin).toBe("https://raw.githubusercontent.com/SYMBaiEX/usagemax/main/plugin.json");
  });
});
