export const dynamic = "force-static";

// This endpoint publishes public verification material only. UsageMax does not
// currently require Web Bot Auth signatures, so no private signing key is
// stored in the repository or exposed by the application.
const directory = {
  keys: [{
    kty: "OKP",
    crv: "Ed25519",
    alg: "ed25519",
    use: "sig",
    key_ops: ["verify"],
    kid: "L2WcRRr3QYkLJnEdYS_8IKoEkRrq7XMOgZCRRbza6Zg",
    x: "YOM4beNwhZvQzFh7tvtCRlAL4cyDWLyjF0UFuaaeKuw",
    nbf: 1789516800,
    exp: 1821097347,
  }],
};

const headers = {
  "access-control-allow-origin": "*",
  "cache-control": "public, max-age=3600",
  "content-type": "application/http-message-signatures-directory+json",
  "x-content-type-options": "nosniff",
};

export function GET() {
  return new Response(JSON.stringify(directory), { headers });
}

export function HEAD() {
  return new Response(null, { headers });
}
