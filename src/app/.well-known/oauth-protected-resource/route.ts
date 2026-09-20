import { workosAgentAuthGuideUrl, workosAuthkitDomain } from "@/lib/workos-connect";

export const dynamic = "force-static";

const metadata = {
  resource: "https://usagemax.com/api",
  resource_documentation: "https://usagemax.com/auth.md",
  authorization_servers: [workosAuthkitDomain()],
  bearer_methods_supported: ["header"],
  // WorkOS Connect handles consent, code exchange, refresh, revocation, and
  // agent registration. These resource scopes are configured in WorkOS and
  // are intentionally separate from the installation-bound collector token.
  scopes_supported: ["openid", "profile", "email", "offline_access", "usage:read", "data:export", "telemetry:write", "outcomes:write"],
  x_usagemax_authentication: {
    collector_token: "umx_ prefix, installation-bound, write-only",
    collector_scopes: ["telemetry:write", "outcomes:write"],
    oauth_delegation: "workos_connect",
    agent_registration_skill: workosAgentAuthGuideUrl(),
  },
};

const headers = {
  "access-control-allow-origin": "*",
  "cache-control": "public, max-age=3600",
  "content-type": "application/json; charset=utf-8",
};

export function GET() {
  return new Response(JSON.stringify(metadata), { headers });
}

export function HEAD() {
  return new Response(null, { headers });
}
