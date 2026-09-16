import { describe, expect, it } from "vitest";
import { GET, POST } from "./route";

const request = (body: string, headers: Record<string, string> = {}) => new Request("https://usagemax.com/mcp", { method: "POST", body, headers: { "content-type": "application/json", ...headers } });

describe("MCP HTTP boundary", () => {
  it("accepts ordinary JSON-RPC POST without custom mirror headers", async () => {
    const response = await POST(request(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
  });
  it("rejects wrong method, content type, origin, and oversized bodies", async () => {
    expect((await GET())).toBeInstanceOf(Response);
    expect((await GET()).status).toBe(405);
    expect((await POST(request("{}", { "content-type": "text/plain" }))).status).toBe(415);
    expect((await POST(request("{}", { origin: "https://evil.example" }))).status).toBe(403);
    expect((await POST(request("x".repeat(64 * 1024 + 1)))).status).toBe(413);
  });
  it("honors official response negotiation", async () => {
    expect((await POST(request("{}", { accept: "text/html" }))).status).toBe(406);
  });
});
