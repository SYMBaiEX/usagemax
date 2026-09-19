import { describe, expect, it } from "vitest";
import { GET, HEAD } from "./route";

describe("retired screen API", () => {
  it("returns a machine-readable retirement response with retry-safe routing metadata", async () => {
    const response = await GET();
    expect(response.status).toBe(410);
    expect(response.headers.get("deprecation")).toBe("true");
    expect(response.headers.get("sunset")).toBe("2026-12-31T00:00:00Z");
    expect(response.headers.get("allow")).toBe("GET, HEAD");
    await expect(response.json()).resolves.toMatchObject({ error: "screen_api_retired" });
  });

  it("supports HEAD without returning a response body", async () => {
    const response = await HEAD();
    expect(response.status).toBe(410);
    expect(response.headers.get("allow")).toBe("GET, HEAD");
    expect(await response.text()).toBe("");
  });
});
