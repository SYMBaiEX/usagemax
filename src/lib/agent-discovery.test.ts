import serverMetadata from "../../server.json";
import { describe, expect, it } from "vitest";

describe("local MCP Registry metadata", () => {
  it("describes the public remote without implying a package or listing", () => {
    expect(serverMetadata).toMatchObject({
      "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
      name: "io.github.symbaiex/usagemax",
      repository: { url: "https://github.com/SYMBaiEX/usagemax", source: "github" },
      version: "1.0.0",
      websiteUrl: "https://usagemax.com",
      icons: [{ src: "https://usagemax.com/brand/icon-192.png", mimeType: "image/png", sizes: ["192x192"] }],
      remotes: [{ type: "streamable-http", url: "https://usagemax.com/mcp" }],
    });
    expect(serverMetadata).not.toHaveProperty("packages");
  });
});
