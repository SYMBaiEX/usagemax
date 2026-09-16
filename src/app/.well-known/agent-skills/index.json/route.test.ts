import { describe, expect, it } from "vitest";
import { GET, HEAD } from "./route";

describe("Agent Skills discovery index", () => {
  it("publishes digest-pinned first-party skill routes", async () => {
    const body = await (await GET()).json();
    expect(body.$schema).toBe("https://schemas.agentskills.io/discovery/0.2.0/schema.json");
    expect(body.skills).toEqual([
      expect.objectContaining({ name: "usage-observability", type: "skill-md", digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/) }),
      expect.objectContaining({ name: "enterprise-reporting", type: "skill-md", digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/) }),
    ]);
    expect(body.skills.every((skill: { url: string }) => skill.url.startsWith("https://raw.githubusercontent.com/SYMBaiEX/usagemax/main/skills/"))).toBe(true);
  });

  it("supports cacheable JSON metadata HEAD requests", () => {
    expect(HEAD().status).toBe(200);
    expect(HEAD().headers.get("content-type")).toContain("application/json");
  });
});
