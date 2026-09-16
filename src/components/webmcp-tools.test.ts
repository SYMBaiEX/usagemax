import { describe, expect, it } from "vitest";
import { detectWebMcpContext, tools } from "./webmcp-tools";

describe("WebMCP detection", () => {
  it("prefers the standard document modelContext API", () => {
    const documentContext = { registerTool: () => undefined };
    const navigatorContext = { registerTool: () => undefined };
    expect(detectWebMcpContext(documentContext, navigatorContext)).toMatchObject({ source: "document", context: documentContext });
  });

  it("uses navigator.modelContext only as a compatibility fallback", () => {
    const navigatorContext = { registerTool: () => undefined };
    expect(detectWebMcpContext(undefined, navigatorContext)).toMatchObject({ source: "navigator", context: navigatorContext });
    expect(detectWebMcpContext(undefined, undefined)).toBeUndefined();
  });

  it("exposes only bounded read-only tools with closed schemas", () => {
    expect(tools).toHaveLength(4);
    for (const tool of tools) {
      expect(tool.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, openWorldHint: false });
      expect(tool.inputSchema).toMatchObject({ type: "object", additionalProperties: false });
    }
  });
});
