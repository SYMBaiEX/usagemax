import { describe, expect, it } from "vitest";
import { GET, HEAD } from "./route";

describe("pricing resource", () => {
  it("publishes explicit free tiers and truthful enterprise boundaries", async () => {
    const response = GET();
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    const body = await response.text();
    expect(body).toContain("Personal — $0/month");
    expect(body).toContain("Small teams — $0/month");
    expect(body).toContain("Enterprise — custom agreement");
    expect(body).toContain("Up to 10 members");
    expect(body).toContain("no trial clock");
    expect(body).toContain("Prompts, completions, source code");
    expect(body).not.toContain("$99");
  });

  it("supports a cacheable HEAD request", () => {
    expect(HEAD().status).toBe(200);
    expect(HEAD().headers.get("content-type")).toBe("text/markdown; charset=utf-8");
  });
});
