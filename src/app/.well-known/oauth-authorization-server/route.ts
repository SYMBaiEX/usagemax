import {
  workosAgentAuthGuideUrl,
  workosAuthorizationEndpoint,
  workosAuthorizationServerMetadataUrl,
  workosAuthkitDomain,
  workosJwksUrl,
  workosTokenEndpoint,
} from "@/lib/workos-connect";

export const dynamic = "force-dynamic";
export const revalidate = 300;

const headers = {
  "access-control-allow-origin": "*",
  "cache-control": "public, max-age=300, stale-while-revalidate=86400",
  "content-type": "application/json; charset=utf-8",
};

function fallbackMetadata() {
  return {
    issuer: workosAuthkitDomain(),
    authorization_endpoint: workosAuthorizationEndpoint(),
    token_endpoint: workosTokenEndpoint(),
    jwks_uri: workosJwksUrl(),
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token", "urn:ietf:params:oauth:grant-type:device_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: ["openid", "profile", "email", "offline_access"],
    device_authorization_endpoint: `${workosAuthkitDomain()}/oauth2/device_authorization`,
  };
}

async function metadata() {
  try {
    const response = await fetch(workosAuthorizationServerMetadataUrl(), {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(2_500),
    });
    if (response.ok) {
      const remote = await response.json() as Record<string, unknown>;
      // Preserve WorkOS's signed-credential discovery exactly. The extension
      // only names the UsageMax resource and our browser-session boundary.
      return {
        ...remote,
        x_usagemax_authentication: {
          browser_sign_in_endpoint: "https://usagemax.com/sign-in",
          authorization_server: workosAuthkitDomain(),
          agent_registration_skill: workosAgentAuthGuideUrl(),
          collector_token: "Installation-bound write-only bearer token created by the account link flow",
          oauth_delegation: "workos_connect",
        },
      };
    }
  } catch {
    // A discovery endpoint must remain useful during a WorkOS transient error;
    // the standards-shaped fallback contains only public endpoint metadata.
  }
  return {
    ...fallbackMetadata(),
    x_usagemax_authentication: {
      browser_sign_in_endpoint: "https://usagemax.com/sign-in",
      authorization_server: workosAuthkitDomain(),
      agent_registration_skill: workosAgentAuthGuideUrl(),
      collector_token: "Installation-bound write-only bearer token created by the account link flow",
      oauth_delegation: "workos_connect",
    },
  };
}

export async function GET() {
  return new Response(JSON.stringify(await metadata()), { headers });
}

export function HEAD() {
  return new Response(null, { headers });
}
