import { describe, expect, it } from "vitest";
import { agentHomepage } from "@/lib/agent-index";
import { requestsMarkdown } from "./lib/markdown-negotiation";

const request = (headers: Record<string, string>) => ({ headers: new Headers(headers) });

describe("public markdown negotiation", () => {
  it.each(["GPTBot/1.0", "ClaudeBot", "ChatGPT-User", "PerplexityBot", "Google-Extended", "Applebot-Extended", "ora-agent", "DeepSeekBot"]) ("serves markdown to %s", (userAgent) => {
    expect(requestsMarkdown(request({ "user-agent": userAgent }))).toBe(true);
  });

  it("keeps ordinary HTML requests unchanged", () => {
    expect(requestsMarkdown(request({ "user-agent": "Mozilla/5.0", accept: "text/html" }))).toBe(false);
  });

  it("still honors an explicit markdown accept header", () => {
    expect(requestsMarkdown(request({ accept: "text/markdown" }))).toBe(true);
  });
});

describe("agent homepage contract", () => {
  it("identifies itself as a stable machine-readable discovery view", () => {
    const view = agentHomepage();

    expect(view).toMatchObject({
      schemaVersion: "1.0",
      version: "1.0.0",
      mode: "agent",
      agentMode: true,
      mediaType: "application/json",
      machineReadable: true,
      type: "agent-capability-index",
      name: "UsageMax",
    });
    expect(view.brand).toMatchObject({ name: "UsageMax", url: "https://usagemax.com", logo: "https://usagemax.com/brand/icon-192.png" });
    expect(view.discovery).toMatchObject({
      llms: "https://usagemax.com/llms.txt",
      openapi: "https://usagemax.com/openapi.json",
      mcp: "https://usagemax.com/.well-known/mcp/server-card.json",
      a2a: "https://usagemax.com/.well-known/agent-card.json",
    });
    expect(view.endpoints.map((endpoint) => endpoint.path)).toContain("/api/v1/devices/status");
    expect(view.api).toMatchObject({
      baseUrl: "https://usagemax.com/api",
      openapi: "https://usagemax.com/openapi.json",
      sandbox: "https://usagemax.com/api/v1/sandbox/validate",
    });
    expect(view.tools.length).toBeGreaterThanOrEqual(4);
    expect(view.developerResources.map((resource) => resource.url)).toContain("https://usagemax.com/auth.md");
    expect(view.developerResources.map((resource) => resource.url)).toContain("https://registry.modelcontextprotocol.io/v0.1/servers/io.github.SYMBaiEX%2Fusagemax/versions/latest");
  });
});
