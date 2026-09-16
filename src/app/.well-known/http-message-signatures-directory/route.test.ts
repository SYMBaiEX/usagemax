import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { GET, HEAD } from "./route";

describe("HTTP Message Signatures directory", () => {
  it("publishes a valid public Ed25519 JWK without making signatures mandatory", async () => {
    const response = GET();
    expect(response.headers.get("content-type")).toBe("application/http-message-signatures-directory+json");
    const body = await response.json();
    expect(body.keys).toEqual([expect.objectContaining({ kty: "OKP", crv: "Ed25519", alg: "ed25519", use: "sig", key_ops: ["verify"], nbf: expect.any(Number), exp: expect.any(Number) })]);
    const key = body.keys[0];
    expect(key.kid).toBe(createHash("sha256").update(JSON.stringify({ crv: key.crv, kty: key.kty, x: key.x })).digest("base64url"));
    expect(key.kid).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(key.x).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(key.exp).toBeGreaterThan(key.nbf);
  });

  it("supports cacheable directory HEAD requests", () => {
    const response = HEAD();
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(response.headers.get("content-type")).toBe("application/http-message-signatures-directory+json");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
