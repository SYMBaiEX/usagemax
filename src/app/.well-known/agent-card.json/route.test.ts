import { describe, expect, it } from "vitest";
import { GET, HEAD } from "./route";

describe("A2A agent card", () => {
  it("describes the actual bounded interface", async () => {
    const card = await (await GET()).json();
    expect(card.supportedInterfaces).toEqual([{ url: "https://usagemax.com/a2a", protocolBinding: "JSONRPC", protocolVersion: "1.0" }]);
    expect(card.capabilities).toMatchObject({ streaming: false, pushNotifications: false, extendedAgentCard: false });
    expect(card.securitySchemes).toEqual({});
    expect(card.skills).toHaveLength(1);
  });

  it("supports metadata HEAD", () => {
    const response = HEAD();
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("etag")).toBe('"UsageMax-agent-card-1.0.0"');
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
