import { describe, expect, it } from "vitest";
import { GET, POST } from "./route";

describe("NLWeb ask", () => {
  it("returns a bounded cited JSON answer", async () => {
    const response = await POST(new Request("https://usagemax.com/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "How does UsageMax count tokens?" }) }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body._meta).toEqual({ response_type: "answer", version: "0.5" });
    expect(body.results[0].url).toBe("https://usagemax.com/methodology");
    expect(body.sources).toContain("https://usagemax.com/methodology");
  });

  it("supports explicit SSE streaming and validation", async () => {
    const streaming = await GET(new Request("https://usagemax.com/ask?query=security&streaming=true"));
    expect(streaming.headers.get("content-type")).toContain("text/event-stream");
    expect(await streaming.text()).toContain("event: complete");
    expect((await POST(new Request("https://usagemax.com/ask", { method: "POST", headers: { "content-type": "text/plain" }, body: "x" }))).status).toBe(415);
  });
});
