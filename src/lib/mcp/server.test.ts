import { describe, expect, it } from "vitest";
import { DOCS, handleMcp } from "./server";

describe("UsageMax MCP", () => {
  it("supports initialize and lists only read tools", async () => {
    const init = await handleMcp({ jsonrpc: "2.0", id: 1, method: "initialize" });
    expect("result" in init ? init.result : null).toMatchObject({ protocolVersion: "2025-06-18", capabilities: { tools: {} } });
    const list = await handleMcp({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect(("result" in list ? list.result as { tools: { name: string }[] } : { tools: [] }).tools.map((tool) => tool.name)).toEqual(["public_profile", "leaderboard", "network_stats", "ask_site", "docs_search", "docs_get"]);
  });
  it("executes bounded public and documentation reads", async () => {
    const calls: string[] = [];
    const query = async (fn: unknown, args: Record<string, unknown>) => { calls.push(JSON.stringify(args)); return fn === undefined ? null : { ok: true }; };
    expect("result" in (await handleMcp({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "network_stats", arguments: {} } }, query))).toBe(true);
    const docs = await handleMcp({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "docs_get", arguments: { id: "overview" } } });
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
