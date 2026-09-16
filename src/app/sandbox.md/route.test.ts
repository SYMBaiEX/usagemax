import { describe, expect, it } from "vitest";
import { GET, HEAD } from "./route";

describe("sandbox markdown guide", () => {
  it("documents a no-account, no-write numeric-safe smoke test", async () => {
    const response = GET();
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(body).toContain("Try it without an account");
    expect(body).toContain("writes: false");
    expect(body).toContain("eventType");
    expect(body).toContain("totalTokens");
    expect(body).toContain("costMicros");
    expect(body).not.toContain("Authorization: Bearer");
  });

  it("supports a markdown HEAD request", () => {
    expect(HEAD().status).toBe(200);
    expect(HEAD().headers.get("content-type")).toBe("text/markdown; charset=utf-8");
  });
});
