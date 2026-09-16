import { describe, expect, it } from "vitest";
import { GET, HEAD } from "./route";

describe("sandbox descriptor API", () => {
  it("describes a public no-write validation environment", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ environment: "sandbox", writes: false, authentication: "none", endpoint: "https://usagemax.com/api/v1/sandbox/validate" });
  });

  it("supports machine metadata HEAD requests", () => {
    expect(HEAD().status).toBe(200);
    expect(HEAD().headers.get("content-type")).toBe("application/json; charset=utf-8");
  });
});
