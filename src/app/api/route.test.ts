import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("API entry point", () => {
  it("returns a structured authentication hint with discovery links", async () => {
    const response = GET();
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("oauth-protected-resource");
    expect(response.headers.get("link")).toContain("openapi.json");
    expect(await response.json()).toEqual(expect.objectContaining({ error: "api_root", message: expect.any(String), hint: expect.any(String) }));
  });
});
