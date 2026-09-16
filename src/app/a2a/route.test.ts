import { describe, expect, it } from "vitest";
import { GET, POST } from "./route";

describe("public A2A endpoint", () => {
  it("returns a bounded read-only answer for SendMessage", async () => {
    const response = await POST(new Request("https://usagemax.com/a2a", {
      method: "POST",
      headers: { "content-type": "application/a2a+json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "SendMessage", params: { message: { parts: [{ text: "How does UsageMax count tokens?" }] } } }),
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("a2a-version")).toBe("1.0");
    expect(await response.json()).toMatchObject({ jsonrpc: "2.0", id: 7, result: { message: { role: "ROLE_AGENT", parts: [{ text: expect.any(String) }] } } });
  });

  it("rejects unknown methods and non-text/unbounded messages", async () => {
    const unknown = await POST(new Request("https://usagemax.com/a2a", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tasks/get", params: {} }) }));
    expect(await unknown.json()).toMatchObject({ error: { code: -32601, message: "method_not_found" } });
    const invalid = await POST(new Request("https://usagemax.com/a2a", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "SendMessage", params: { message: { parts: [{ data: "private" }] } } }) }));
    expect(await invalid.json()).toMatchObject({ error: { code: -32602, message: "invalid_params" } });
  });

  it("documents the no-task boundary", async () => {
    expect(await (await GET()).json()).toMatchObject({ capabilities: { tasks: false }, endpoint: "https://usagemax.com/a2a" });
  });
});
