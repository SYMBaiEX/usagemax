import { describe, expect, it, vi } from "vitest";
import { detectWebMcpContext, registerDocumentWebMcpTools, tools } from "./webmcp-tools";

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
      expect(tool.title).toEqual(expect.any(String));
      expect(tool.annotations).toEqual({ readOnlyHint: true, untrustedContentHint: true, consequentialHint: false });
      expect(tool.inputSchema).toMatchObject({ type: "object", additionalProperties: false });
    }
  });

  it("registers every tool on the normative document modelContext with one abort signal", async () => {
    const registerTool = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("document", { modelContext: { registerTool } });
    const controller = new AbortController();

    try {
      await expect(registerDocumentWebMcpTools(controller.signal)).resolves.toBe(tools.length);
      expect(registerTool).toHaveBeenCalledTimes(tools.length);
      expect(registerTool.mock.calls[0]).toEqual([tools[0], { signal: controller.signal }]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not register after the lifecycle signal is already aborted", async () => {
    const registerTool = vi.fn();
    vi.stubGlobal("document", { modelContext: { registerTool } });
    const controller = new AbortController();
    controller.abort();

    try {
      await expect(registerDocumentWebMcpTools(controller.signal)).resolves.toBe(0);
      expect(registerTool).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
