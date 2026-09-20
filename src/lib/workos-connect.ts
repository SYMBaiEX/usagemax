import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

/**
 * WorkOS Connect is the authorization server for delegated UsageMax access.
 * Keep the domain configurable so preview and production environments can use
 * their own AuthKit environment, while retaining the currently configured
 * production domain for deployments that have not yet copied the public env.
 */
export const DEFAULT_WORKOS_AUTHKIT_DOMAIN = "https://wholesome-car-48.authkit.app";
export const USAGEMAX_RESOURCE = "https://usagemax.com/api";

function normalizeHttpsUrl(value: string | undefined, fallback: string) {
  try {
    const url = new URL(value || fallback);
    if (url.protocol !== "https:") return fallback;
    return url.toString().replace(/\/$/, "");
  } catch {
    return fallback;
  }
}

export function workosAuthkitDomain() {
  return normalizeHttpsUrl(
    process.env.WORKOS_AUTHKIT_DOMAIN || process.env.NEXT_PUBLIC_WORKOS_AUTHKIT_DOMAIN,
    DEFAULT_WORKOS_AUTHKIT_DOMAIN,
  );
}

export function workosConnectClientId() {
  return process.env.WORKOS_CONNECT_CLIENT_ID || process.env.WORKOS_CLIENT_ID;
}

export function workosAuthorizationServerMetadataUrl() {
  return `${workosAuthkitDomain()}/.well-known/oauth-authorization-server`;
}

export function workosAgentAuthGuideUrl() {
  return `${workosAuthkitDomain()}/agent/auth.md`;
}

export function workosAuthorizationEndpoint() {
  return `${workosAuthkitDomain()}/oauth2/authorize`;
}

export function workosTokenEndpoint() {
  return `${workosAuthkitDomain()}/oauth2/token`;
}

export function workosJwksUrl() {
  return `${workosAuthkitDomain()}/oauth2/jwks`;
}

export type WorkOSDelegatedClaims = JWTPayload & {
  client_id?: string;
  org_id?: string;
  scope?: string;
  act?: { sub?: string; [key: string]: unknown };
};

let remoteJwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let remoteJwksUrl = "";

function jwks() {
  const url = workosJwksUrl();
  if (!remoteJwks || remoteJwksUrl !== url) {
    remoteJwks = createRemoteJWKSet(new URL(url));
    remoteJwksUrl = url;
  }
  return remoteJwks;
}

/**
 * Verify a WorkOS Connect access token locally against the WorkOS JWKS.
 * No token value is logged or returned from diagnostics. The audience accepts
 * either the configured Connect client or the UsageMax protected resource,
 * matching WorkOS's documented resource-audience behavior.
 */
export async function verifyWorkOSDelegatedToken(token: string) {
  if (!/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null;
  const clientId = workosConnectClientId();
  const audience = [...new Set([clientId, USAGEMAX_RESOURCE].filter((value): value is string => Boolean(value)))];
  if (process.env.NODE_ENV === "production" && !clientId) return null;
  try {
    const result = await jwtVerify<WorkOSDelegatedClaims>(token, jwks(), {
      issuer: workosAuthkitDomain(),
      ...(audience.length ? { audience } : {}),
      algorithms: ["RS256"],
      clockTolerance: 10,
    });
    return result.payload;
  } catch {
    return null;
  }
}

export function scopesFromWorkOSClaims(claims: Pick<WorkOSDelegatedClaims, "scope">) {
  return new Set((claims.scope || "").split(/\s+/).map((scope) => scope.trim()).filter(Boolean));
}

export function hasWorkOSScope(claims: Pick<WorkOSDelegatedClaims, "scope">, required: string | string[]) {
  const scopes = scopesFromWorkOSClaims(claims);
  return (Array.isArray(required) ? required : [required]).every((scope) => scopes.has(scope));
}

export function delegatedPrincipal(claims: WorkOSDelegatedClaims) {
  return {
    subject: typeof claims.sub === "string" ? claims.sub : null,
    actorSubject: typeof claims.act?.sub === "string" ? claims.act.sub : null,
    organizationId: typeof claims.org_id === "string" ? claims.org_id : null,
    clientId: typeof claims.client_id === "string" ? claims.client_id : null,
    scopes: [...scopesFromWorkOSClaims(claims)],
    expiresAt: typeof claims.exp === "number" ? claims.exp : null,
  };
}
