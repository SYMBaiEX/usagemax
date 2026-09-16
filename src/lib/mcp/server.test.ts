import { describe, expect, it } from "vitest";
import { DOCS, DOC_TOOL_DEFINITIONS, handleMcp, MCP_APP_RESOURCE_URI, MCP_SERVER_NAMES, MCP_SERVER_VERSION, USAGEMAX_TOOLS } from "./server";

describe("UsageMax MCP", () => {
  it("supports initialize and lists only read tools", async () => {
    const init = await handleMcp({ jsonrpc: "2.0", id: 1, method: "initialize" });
    expect("result" in init ? init.result : null).toMatchObject({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: MCP_SERVER_NAMES.public, version: MCP_SERVER_VERSION } });
    expect("result" in init ? init.result : null).toMatchObject({ instructions: expect.stringContaining("read-only") });
    const list = await handleMcp({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect(("result" in list ? list.result as { tools: { name: string }[] } : { tools: [] }).tools.map((tool) => tool.name)).toEqual(["public_profile", "leaderboard", "network_stats", "ask_site", "docs_list", "docs_search", "docs_get"]);
  });
  it("describes the docs surface without claiming product resources", async () => {
    const init = await handleMcp({ jsonrpc: "2.0", id: 1, method: "initialize" }, undefined, "docs");
    expect("result" in init ? init.result : null).toMatchObject({ serverInfo: { name: MCP_SERVER_NAMES.docs, version: MCP_SERVER_VERSION }, instructions: expect.stringContaining("documentation tools") });
    expect("result" in init ? init.result : null).not.toMatchObject({ instructions: expect.stringContaining("MCP App resource") });
    expect("result" in init ? init.result : null).toMatchObject({ capabilities: { tools: {} } });
  });
  it("annotates every live tool as bounded read-only", () => {
    for (const tool of [...USAGEMAX_TOOLS, ...DOC_TOOL_DEFINITIONS]) {
      expect(tool.name).toMatch(/^[a-z][a-z0-9_]+$/);
      expect(tool.description.length).toBeGreaterThan(10);
      expect(tool.inputSchema).toMatchObject({ type: "object", additionalProperties: false });
      expect(tool.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, openWorldHint: false });
    }
  });
  it("keeps product and documentation MCP surfaces distinct", async () => {
    const product = await handleMcp({ jsonrpc: "2.0", id: 1, method: "tools/list" }, undefined, "public");
    const docs = await handleMcp({ jsonrpc: "2.0", id: 2, method: "tools/list" }, undefined, "docs");
    expect("result" in product ? (product.result as { tools: { name: string }[] }).tools.map((tool) => tool.name) : []).toEqual(["public_profile", "leaderboard", "network_stats", "ask_site"]);
    expect("result" in docs ? (docs.result as { tools: { name: string }[] }).tools.map((tool) => tool.name) : []).toEqual(["docs_list", "docs_search", "docs_get"]);
  });
  it("exposes the product MCP App as a bounded resource", async () => {
    const resources = await handleMcp({ jsonrpc: "2.0", id: 1, method: "resources/list" }, undefined, "public");
    expect("result" in resources ? resources.result : null).toMatchObject({ resources: [{ uri: MCP_APP_RESOURCE_URI, mimeType: "text/html;profile=mcp-app" }] });
    const view = await handleMcp({ jsonrpc: "2.0", id: 2, method: "resources/read", params: { uri: MCP_APP_RESOURCE_URI } }, undefined, "public");
    expect("result" in view ? view.result : null).toMatchObject({ contents: [{ uri: MCP_APP_RESOURCE_URI, mimeType: "text/html;profile=mcp-app", text: expect.stringContaining("connect-src https://usagemax.com") }] });
    const docs = await handleMcp({ jsonrpc: "2.0", id: 3, method: "resources/list" }, undefined, "docs");
    expect("result" in docs ? docs.result : null).toEqual({ resources: [] });
  });
  it("executes bounded public and documentation reads", async () => {
    const calls: string[] = [];
    const query = async (fn: unknown, args: Record<string, unknown>) => { calls.push(JSON.stringify(args)); return fn === undefined ? null : { ok: true }; };
    expect("result" in (await handleMcp({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "network_stats", arguments: {} } }, query))).toBe(true);
    const index = await handleMcp({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "docs_list", arguments: {} } });
    expect("result" in index ? index.result : null).toMatchObject({ structuredContent: { resources: expect.arrayContaining([expect.objectContaining({ id: "overview" })]) } });
    const docs = await handleMcp({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "docs_get", arguments: { id: "overview" } } });
    expect("result" in docs ? docs.result : null).toMatchObject({ structuredContent: { id: "overview", text: DOCS.overview } });
    expect(calls).toHaveLength(1);
  });
  it("rejects mutations and invalid arguments", async () => {
    const mutation = await handleMcp({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "ingest", arguments: {} } });
    expect("error" in mutation ? mutation.error : null).toMatchObject({ code: -32601 });
    const invalid = await handleMcp({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "public_profile", arguments: { handle: "bad handle" } } });
    expect("error" in invalid ? invalid.error : null).toMatchObject({ code: -32602 });
  });
});
