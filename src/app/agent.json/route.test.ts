import { describe, expect, it } from "vitest";

import { GET, HEAD } from "./route";

describe("agent capability index alias", () => {
  it("returns the stable machine-readable agent contract", async () => {
    const response = GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(body).toMatchObject({
      name: "UsageMax",
      mode: "agent",
      machineReadable: true,
      canonicalUrl: "https://usagemax.com/agent.json",
    });
    expect(body.developerResources).toEqual(expect.arrayContaining([{ name: "agentMode", url: "https://usagemax.com/agent.json", mediaType: "application/json" }]));
  });

  it("supports metadata-only discovery", () => {
    const response = HEAD();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
  });
});
