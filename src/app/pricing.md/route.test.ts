import { describe, expect, it } from "vitest";
import { GET, HEAD } from "./route";

describe("pricing resource", () => {
  it("publishes truthful plan boundaries without a fabricated rate card", async () => {
    const response = GET();
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    const body = await response.text();
    expect(body).toContain("Personal — free");
    expect(body).toContain("Small teams — free");
    expect(body).toContain("Enterprise — by agreement");
    expect(body).toContain("prompts, completions, source code");
    expect(body).not.toMatch(/\$\d/);
  });

  it("supports a cacheable HEAD request", () => {
    expect(HEAD().status).toBe(200);
    expect(HEAD().headers.get("content-type")).toBe("text/markdown; charset=utf-8");
  });
});
