import { describe, expect, it } from "vitest";
import { POST } from "./route";

const valid = { events: [{ eventKey: "e1", model: "gpt-test", occurredAt: "2026-09-16T12:00:00Z" }] };

describe("sandbox validation API", () => {
  it("validates without storage and identifies the existing batch contract", async () => {
    const response = await POST(new Request("https://test/api/v1/sandbox/validate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(valid) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, accepted: 1, writes: false });
    expect(response.headers.get("x-api-version")).toBe("1");
  });

  it("rejects content fields and unknown fields", async () => {
    const response = await POST(new Request("https://test/api/v1/sandbox/validate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ events: [{ ...valid.events[0], prompt: "secret" }] }) }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(expect.objectContaining({ error: "invalid_sandbox_input", message: expect.any(String), hint: expect.any(String) }));
  });

  it("rejects non-JSON input", async () => {
    const response = await POST(new Request("https://test/api/v1/sandbox/validate", { method: "POST", body: "{}" }));
    expect(response.status).toBe(415);
  });
});
