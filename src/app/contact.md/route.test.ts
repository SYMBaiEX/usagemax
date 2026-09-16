import { describe, expect, it } from "vitest";
import { GET, HEAD } from "./route";

describe("contact markdown route", () => {
  it("returns canonical markdown metadata", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/markdown");
    expect(await response.text()).toContain("canonical: https://usagemax.com/contact");
  });

  it("supports a bodyless HEAD response", async () => {
    expect((await HEAD()).body).toBeNull();
  });
});
