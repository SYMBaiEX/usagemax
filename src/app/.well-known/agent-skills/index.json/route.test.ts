import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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

  it("keeps the public index digest and frontmatter synchronized with local skills", async () => {
    const body = await (await GET()).json();
    const localSkills = readdirSync(new URL("../../../../../skills/", import.meta.url)).filter((name) => existsSync(new URL(`../../../../../skills/${name}/SKILL.md`, import.meta.url))).sort();

    expect(body.skills.map((skill: { name: string }) => skill.name).sort()).toEqual(localSkills);
    for (const skill of body.skills as { name: string; url: string; digest: string }[]) {
      const contents = readFileSync(new URL(`../../../../../skills/${skill.name}/SKILL.md`, import.meta.url), "utf8");
      expect(skill.url).toBe(`https://raw.githubusercontent.com/SYMBaiEX/usagemax/main/skills/${skill.name}/SKILL.md`);
      expect(createHash("sha256").update(contents).digest("hex")).toBe(skill.digest.replace(/^sha256:/, ""));
      expect(contents).toMatch(new RegExp(`^---\\nname: ${skill.name}\\ndescription: .+\\n---`));
    }
  });

  it("supports cacheable JSON metadata HEAD requests", () => {
    expect(HEAD().status).toBe(200);
    expect(HEAD().headers.get("content-type")).toContain("application/json");
  });
});
