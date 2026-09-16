import { describe, expect, it } from "vitest";
import { GET, HEAD } from "./route";

describe("HTTP Message Signatures directory", () => {
  it("publishes a valid public Ed25519 JWK without making signatures mandatory", async () => {
    const response = GET();
    expect(response.headers.get("content-type")).toBe("application/http-message-signatures-directory+json");
    const body = await response.json();
    expect(body.keys).toEqual([expect.objectContaining({ kty: "OKP", crv: "Ed25519", alg: "EdDSA", use: "sig", nbf: expect.any(Number), exp: expect.any(Number) })]);
    expect(body.keys[0].kid).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.keys[0].x).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("supports cacheable directory HEAD requests", () => {
    expect(HEAD().status).toBe(200);
    expect(HEAD().headers.get("content-type")).toBe("application/http-message-signatures-directory+json");
  });
});
