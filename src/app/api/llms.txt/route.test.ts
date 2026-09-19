import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("API agent guide", () => {
  it("starts with machine-readable frontmatter", async () => {
    const response = GET();
    const body = await response.text();
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(body.startsWith("---\n")).toBe(true);
    expect(body).toContain("\n# UsageMax API\n");
    expect(body).toContain("canonical: https://usagemax.com/api/llms.txt");
    expect(body).toContain("/api/profiles/symbiex");
    expect(body).not.toContain("/api/profiles/{handle}");
    expect(body).not.toContain("/api/v2/usage/snapshots/{runId}");
  });
});
