import { describe, expect, it } from "vitest";
import { GET, HEAD, manifest } from "./route";

describe("Agentic Resource Discovery manifest", () => {
  it("lists only first-party bounded discovery resources", async () => {
    const body = await (await GET()).json();
    expect(body).toEqual(manifest);
    expect(body.specVersion).toBe("0.91");
    expect(body.trustManifest).toEqual({ identity: "https://usagemax.com", identityType: "https", attestations: [{ type: "source-repository", uri: "https://github.com/SYMBaiEX/usagemax", mediaType: "text/html" }] });
    expect(body.entries).toHaveLength(14);
    expect(body.entries.filter((entry: { trustManifest?: unknown }) => entry.trustManifest).every((entry: { trustManifest: { identity: string; attestations: { uri: string }[] } }) => entry.trustManifest.identity === "https://usagemax.com" && entry.trustManifest.attestations[0].uri === "https://github.com/SYMBaiEX/usagemax")).toBe(true);
    expect(body.entries.filter((entry: { representativeQueries?: string[] }) => entry.representativeQueries).every((entry: { representativeQueries: string[] }) => entry.representativeQueries.length >= 2)).toBe(true);
    expect(body.entries.find((entry: { identifier: string }) => entry.identifier === "urn:air:usagemax.com:a2a:public-observability")).toMatchObject({ type: "application/a2a-agent-card+json", url: "https://usagemax.com/.well-known/agent-card.json" });
    expect(body.entries.find((entry: { identifier: string }) => entry.identifier === "urn:air:usagemax.com:registry:mcp")).toMatchObject({
      url: "https://registry.modelcontextprotocol.io/v0.1/servers/io.github.SYMBaiEX%2Fusagemax/versions/latest",
      metadata: { relationship: "official-registry-record", artifactOwner: "modelcontextprotocol.io" },
    });
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
