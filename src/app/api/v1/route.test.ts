import { describe, expect, it } from "vitest";
import { GET, HEAD } from "./route";

describe("/api/v1 namespace entry point", () => {
  it("publishes a machine-readable protected-resource hint", async () => {
    const response = GET();
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe('Bearer resource_metadata="https://usagemax.com/.well-known/oauth-protected-resource"');
    expect(response.headers.get("ratelimit-limit")).toBe("60");
    expect(await response.json()).toMatchObject({ error: "api_v1_root", documentation: "https://usagemax.com/docs" });
  });

  it("keeps HEAD discoverable without returning a body", async () => {
    const response = HEAD();
    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.text()).toBe("");
  });
});
