import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("unknown API routes", () => {
  it("returns a machine-readable 404 with recovery links", async () => {
    const response = GET();
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("allow")).toContain("GET");
    expect(response.headers.get("link")).toContain("openapi.json");
    expect(await response.json()).toMatchObject({ error: "api_route_not_found", message: expect.any(String), hint: expect.any(String) });
  });
});
