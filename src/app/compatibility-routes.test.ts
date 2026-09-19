import { describe, expect, it } from "vitest";
import { GET as getMcpAlias } from "./server-card.json/route";
import { GET as getA2aAlias } from "./agent-card.json/route";
import { GET as getSkillsAlias } from "./agent-skills/index.json/route";

describe("discovery compatibility aliases", () => {
  it("serve the canonical MCP card contract", async () => {
    const body = await getMcpAlias().json();
    expect(body.name).toBe("UsageMax public observability");
    expect(body.serverUrl).toBe("https://usagemax.com/mcp");
  });

  it("serve the canonical A2A card contract", async () => {
    const body = await getA2aAlias().json();
    expect(body.supportedInterfaces).toEqual([{ url: "https://usagemax.com/a2a", protocolBinding: "JSONRPC", protocolVersion: "1.0" }]);
  });

  it("serve the digest-pinned skills index", async () => {
    const body = await getSkillsAlias().json();
    expect(body.version).toBe("0.2.0");
    expect(body.skills).toHaveLength(3);
    expect(body.skills.every((skill: { digest?: string }) => skill.digest?.startsWith("sha256:"))).toBe(true);
  });
});
