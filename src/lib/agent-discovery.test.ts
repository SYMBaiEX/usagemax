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
  it("states the real browser boundary and WorkOS delegated OAuth issuer", () => {
    expect(agentHomepage().authentication).toMatchObject({
      browserSignIn: "https://usagemax.com/sign-in",
      oauthDelegation: "workos_connect",
      authorizationServer: expect.stringContaining("authkit.app"),
    });
  });
});

describe("agent brand authority metadata", () => {
  it("only advertises verified first-party profiles and registries", () => {
    expect(agentHomepage().brand.sameAs).toEqual(expect.arrayContaining([
      "https://github.com/SYMBaiEX/usagemax",
      "https://github.com/SYMBaiEX",
      "https://www.npmjs.com/package/usagemax",
      "https://www.npmjs.com/~symbaiex",
      "https://glama.ai/mcp/connectors/io.github.SYMBaiEX/usagemax",
      "https://registry.modelcontextprotocol.io/v0.1/servers/io.github.SYMBaiEX%2Fusagemax/versions/latest",
    ]));
  });
});

describe("agent pricing metadata", () => {
  it("publishes comparable plan tiers without inventing enterprise pricing", () => {
    expect(agentHomepage().pricingPlans).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "personal", price: { amount: 0, currency: "USD", interval: "month" } }),
      expect.objectContaining({ id: "small-teams", limits: expect.objectContaining({ members: 10 }) }),
      expect.objectContaining({ id: "enterprise", price: expect.objectContaining({ qualifier: "custom_agreement", amount: null }) }),
    ]));
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
      { name: "profileMarkdown", url: "https://usagemax.com/profile.md", mediaType: "text/markdown", template: true, exampleUrl: "https://usagemax.com/symbiex.md", pathPattern: "/{handle}.md" },
      { name: "aiCatalog", url: "https://usagemax.com/.well-known/ai-catalog.json", mediaType: "application/json" },
      { name: "apiCatalog", url: "https://usagemax.com/.well-known/api-catalog", mediaType: "application/linkset+json" },
      { name: "schemaFeed", url: "https://usagemax.com/schema-feed.jsonl", mediaType: "application/jsonl" },
      { name: "agentRules", url: "https://raw.githubusercontent.com/SYMBaiEX/usagemax/main/AGENTS.md", mediaType: "text/plain" },
    ]));
    expect(index.discovery.plugin).toBe("https://raw.githubusercontent.com/SYMBaiEX/usagemax/main/plugin.json");
    expect(index.discovery.aiCatalog).toBe("https://usagemax.com/.well-known/ai-catalog.json");
    expect(index.discovery.apiCatalog).toBe("https://usagemax.com/.well-known/api-catalog");
    expect(index.discovery.schemaFeed).toBe("https://usagemax.com/schema-feed.jsonl");
    expect(index.discovery.agentRules).toBe("https://raw.githubusercontent.com/SYMBaiEX/usagemax/main/AGENTS.md");
    expect(index.links.ask).toBe("/ask?query=UsageMax");
    expect(index.api.versionRoot).toBe("https://usagemax.com/api/v1");
    expect(index.endpoints).toContainEqual(expect.objectContaining({ name: "v1Namespace", path: "/api/v1", authentication: "collector bearer hint" }));
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
        expect.objectContaining({ order: 1, action: "sign_in", url: "https://usagemax.com/sign-in" }),
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
    expect(agentHomepage()).toMatchObject({
      homepage: "https://usagemax.com/",
      documentationUrl: "https://usagemax.com/docs",
      apiUrl: "https://usagemax.com/api",
      openapiUrl: "https://usagemax.com/openapi.json",
      mcpUrl: "https://usagemax.com/mcp",
      authenticationUrl: "https://usagemax.com/auth.md",
      pricingUrl: "https://usagemax.com/pricing.md",
      sdkUrl: "https://www.npmjs.com/package/usagemax",
      webhook: "https://usagemax.com/api/webhooks/workos",
    });
    expect(agentHomepage().links).toMatchObject({
      agent: "https://usagemax.com/agent.json",
      auth: "https://usagemax.com/auth.md",
      endpoint: "https://usagemax.com/openapi.json",
      integration: "https://usagemax.com/docs",
      llms: "https://usagemax.com/llms.txt",
      sdk: "https://www.npmjs.com/package/usagemax",
      webhook: "https://usagemax.com/api/webhooks/workos",
    });
  });
});
