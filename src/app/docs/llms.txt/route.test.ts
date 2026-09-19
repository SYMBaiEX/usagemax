import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("documentation agent guide", () => {
  it("starts with machine-readable frontmatter", async () => {
    const response = GET();
    const body = await response.text();
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(body.startsWith("---\n")).toBe(true);
    expect(body).toContain("\n# UsageMax documentation\n");
    expect(body).toContain("canonical: https://usagemax.com/docs/llms.txt");
  });
});
