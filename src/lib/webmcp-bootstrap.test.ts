import { describe, expect, it } from "vitest";
import { webmcpBootstrap } from "./webmcp-bootstrap";

describe("WebMCP initial-document bootstrap", () => {
  it("uses the normative document registration path with bounded public tools", () => {
    expect(webmcpBootstrap).toContain("document.modelContext.registerTool");
    expect(webmcpBootstrap).toContain("navigator.modelContext");
    expect(webmcpBootstrap).toContain("usagemax_network_stats");
    expect(webmcpBootstrap).toContain("usagemax_ask");
    expect(webmcpBootstrap).not.toContain("Authorization");
  });
});
