import { describe, expect, it } from "vitest";
import { GET, HEAD, manifest } from "./route";

describe("Agentic Resource Discovery manifest", () => {
  it("lists only first-party bounded discovery resources", async () => {
    const body = await (await GET()).json();
    expect(body).toEqual(manifest);
    expect(body.entries).toHaveLength(11);
    expect(body.entries.every((entry: { url: string; trustManifest: { identity: { url: string } } }) => entry.url.startsWith("https://usagemax.com/") || entry.url === "https://www.npmjs.com/package/usagemax")).toBe(true);
    expect(body.entries.every((entry: { trustManifest: { identity: { url: string } } }) => entry.trustManifest.identity.url === "https://usagemax.com")).toBe(true);
  });

  it("supports cacheable JSON metadata HEAD requests", () => {
    expect(HEAD().status).toBe(200);
    expect(HEAD().headers.get("content-type")).toContain("application/json");
  });
});
