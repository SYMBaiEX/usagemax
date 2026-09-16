import { describe, expect, it } from "vitest";
import { POST } from "./route";
import { POST as batchPOST } from "../../batch/validate/route";

const valid = { events: [{ eventKey: "e1", model: "gpt-test", occurredAt: new Date(Date.now() - 60_000).toISOString() }] };

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

  it("keeps the documented batch alias behavior identical", async () => {
    const response = await batchPOST(new Request("https://test/api/v1/batch/validate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(valid) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, accepted: 1, writes: false });
  });
});
