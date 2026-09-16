import { describe, expect, it } from "vitest";
import { GET, HEAD, manifest } from "./route";

describe("Agentic Resource Discovery manifest", () => {
  it("lists only first-party bounded discovery resources", async () => {
    const body = await (await GET()).json();
    expect(body).toEqual(manifest);
    expect(body.specVersion).toBe("0.91");
    expect(body.trustManifest).toEqual({ identity: { type: "web-origin", url: "https://usagemax.com" }, attestations: [{ type: "source-repository", url: "https://github.com/SYMBaiEX/usagemax" }] });
    expect(body.entries).toHaveLength(13);
    expect(body.entries.every((entry: { url: string; trustManifest: { identity: { url: string } } }) => entry.url.startsWith("https://usagemax.com/") || entry.url === "https://www.npmjs.com/package/usagemax")).toBe(true);
    expect(body.entries.every((entry: { trustManifest: { identity: { url: string } } }) => entry.trustManifest.identity.url === "https://usagemax.com")).toBe(true);
    expect(body.entries.filter((entry: { representativeQueries?: string[] }) => entry.representativeQueries).every((entry: { representativeQueries: string[] }) => entry.representativeQueries.length >= 2)).toBe(true);
    expect(body.entries.find((entry: { identifier: string }) => entry.identifier === "urn:air:usagemax.com:a2a:public-observability")).toMatchObject({ type: "application/a2a-agent-card+json", url: "https://usagemax.com/.well-known/agent-card.json" });
  });

  it("supports cacheable JSON metadata HEAD requests", () => {
    const response = HEAD();
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
