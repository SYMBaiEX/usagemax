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
      { name: "profileMarkdown", url: "https://usagemax.com/profile.md", mediaType: "text/markdown", template: true, handlePattern: "https://usagemax.com/<handle>.md" },
      { name: "aiCatalog", url: "https://usagemax.com/.well-known/ai-catalog.json", mediaType: "application/json" },
      { name: "apiCatalog", url: "https://usagemax.com/.well-known/api-catalog", mediaType: "application/linkset+json" },
      { name: "schemaFeed", url: "https://usagemax.com/schema-feed.jsonl", mediaType: "application/jsonl" },
    ]));
    expect(index.discovery.plugin).toBe("https://raw.githubusercontent.com/SYMBaiEX/usagemax/main/plugin.json");
    expect(index.discovery.aiCatalog).toBe("https://usagemax.com/.well-known/ai-catalog.json");
    expect(index.discovery.apiCatalog).toBe("https://usagemax.com/.well-known/api-catalog");
    expect(index.discovery.schemaFeed).toBe("https://usagemax.com/schema-feed.jsonl");
  });

  it("describes integrations and no-write onboarding explicitly", () => {
    expect(agentHomepage().integrations).toEqual(expect.arrayContaining([
      { name: "MCP", url: "https://usagemax.com/mcp", mode: "read-only" },
      { name: "WebMCP", url: "https://usagemax.com/webmcp", mode: "browser-local-read-only" },
    ]));
    expect(agentHomepage().onboarding).toMatchObject({
      freeTier: true,
      noCardRequired: true,
      sandbox: {
        url: "https://usagemax.com/sandbox",
        endpoint: "https://usagemax.com/api/v1/sandbox/validate",
        method: "POST",
        writes: false,
        authentication: "none",
        response: "{ok:true,accepted:number,writes:false}",
      },
      steps: [
        expect.objectContaining({ order: 1, action: "sign_in", url: "https://usagemax.com/auth/start" }),
        expect.objectContaining({ order: 2, action: "link_computer", command: "bunx usagemax" }),
        expect.objectContaining({ order: 3, action: "verify", readOnly: true }),
      ],
    });
    expect(agentHomepage().responseFormats).toMatchObject({
      publicReads: expect.arrayContaining(["application/json", "text/markdown"]),
      errors: expect.stringContaining("machine-readable"),
    });
  });

  it("publishes explicit agent-mode discovery aliases", () => {
    expect(agentHomepage().links).toMatchObject({
      agent: "https://usagemax.com/agent.json",
      auth: "https://usagemax.com/auth.md",
      endpoint: "https://usagemax.com/openapi.json",
      integration: "https://usagemax.com/docs",
      llms: "https://usagemax.com/llms.txt",
    });
  });
});
