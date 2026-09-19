import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("enterprise agent guide", () => {
  it("publishes a focused markdown index", async () => {
    const response = GET();
    const body = await response.text();
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(body.startsWith("---\n")).toBe(true);
    expect(body).toContain("canonical: https://usagemax.com/enterprise/llms.txt");
    expect(body).toContain("/pricing.md");
  });
});
