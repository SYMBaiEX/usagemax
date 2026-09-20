import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../../convex/_generated/api";
import { delegatedPrincipal, hasWorkOSScope, verifyWorkOSDelegatedToken } from "@/lib/workos-connect";

export const dynamic = "force-dynamic";

const resourceMetadata = "https://usagemax.com/.well-known/oauth-protected-resource";

function errorResponse(error: string, status: number, hint: string) {
  return Response.json(
    { error, message: error === "forbidden" ? "The delegated grant does not include this UsageMax resource permission." : "A valid WorkOS Connect delegated bearer is required.", hint, documentation: "https://usagemax.com/auth.md" },
    {
      status,
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
        ...(status === 401 ? { "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadata}", error="invalid_token"` } : {}),
        "x-content-type-options": "nosniff",
      },
    },
  );
}

export async function GET(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return errorResponse("unauthorized", 401, "Discover the WorkOS authorization server and request a UsageMax delegated token.");
  const claims = await verifyWorkOSDelegatedToken(token);
  if (!claims) return errorResponse("unauthorized", 401, "The token issuer, signature, audience, or expiry could not be verified.");
  if (!hasWorkOSScope(claims, "usage:read")) return errorResponse("forbidden", 403, "Request the usage:read permission after enabling it for the WorkOS client or trusted agent registration.");

  try {
    const overview = await fetchQuery(api.workspaces.overview, {}, { token });
    return Response.json({
      ok: true,
      credentialType: "workos_connect_delegated",
      principal: delegatedPrincipal(claims),
      workspace: overview,
      readOnly: true,
    }, { headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  } catch {
    return errorResponse("forbidden", 403, "The delegated subject is not a member of a UsageMax workspace or the workspace is disabled.");
  }
}

export function HEAD() {
  return errorResponse("unauthorized", 401, "Use GET with a WorkOS Connect delegated bearer.");
}
