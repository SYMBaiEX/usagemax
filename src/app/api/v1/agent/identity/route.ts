import { delegatedPrincipal, verifyWorkOSDelegatedToken } from "@/lib/workos-connect";

export const dynamic = "force-dynamic";

const resourceMetadata = "https://usagemax.com/.well-known/oauth-protected-resource";

function unauthorized() {
  return Response.json(
    {
      error: "unauthorized",
      message: "A valid WorkOS Connect delegated bearer is required.",
      hint: "Discover the WorkOS authorization server from the protected-resource metadata and request a UsageMax scope.",
      documentation: "https://usagemax.com/auth.md",
    },
    {
      status: 401,
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
        "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadata}", error="invalid_token"`,
        "x-content-type-options": "nosniff",
      },
    },
  );
}

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return unauthorized();
  const claims = await verifyWorkOSDelegatedToken(token);
  if (!claims) return unauthorized();

  return Response.json(
    {
      ok: true,
      credentialType: "workos_connect_delegated",
      issuer: claims.iss,
      principal: delegatedPrincipal(claims),
      readOnly: true,
      tokenReturned: false,
      documentation: "https://usagemax.com/auth.md",
    },
    {
      headers: {
        "cache-control": "private, no-store",
        "content-type": "application/json; charset=utf-8",
        "x-content-type-options": "nosniff",
      },
    },
  );
}

export function HEAD() {
  return unauthorized();
}
