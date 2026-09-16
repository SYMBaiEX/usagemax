import { describe, expect, test } from "vitest";

import { GET } from "./route";

describe("public markdown homepage", () => {
  test("returns a cacheable markdown representation with explicit negotiation variance", async () => {
    const response = GET();

    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("vary")).toBe("Accept");
    expect(response.headers.get("cache-control")).toContain("public");
    expect(await response.text()).toContain("# UsageMax");
  });
});
