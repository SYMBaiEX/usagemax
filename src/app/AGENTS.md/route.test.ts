import { describe, expect, it } from "vitest";
import { GET, HEAD } from "./route";

describe("/AGENTS.md", () => {
  it("serves heading-led markdown guidance on the canonical domain", async () => {
    const response = GET();
    expect(response.headers.get("content-type")).toContain("text/markdown");
    expect((await response.text()).startsWith("# UsageMax agent rules")).toBe(true);
  });

  it("supports metadata probes without exposing a body", async () => {
    const response = HEAD();
    expect(response.headers.get("content-location")).toBe("https://usagemax.com/AGENTS.md");
    expect(await response.text()).toBe("");
  });
});
