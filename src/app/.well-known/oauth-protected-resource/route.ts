export const dynamic = "force-static";

const metadata = {
  resource: "https://usagemax.com/api",
  resource_documentation: "https://usagemax.com/auth.md",
  bearer_methods_supported: ["header"],
  // These are resource permission labels enforced on UsageMax collector
  // credentials. They are discoverable for least-privilege clients even
  // though UsageMax does not expose an OAuth authorization server.
  scopes_supported: ["telemetry:write", "outcomes:write"],
  // No authorization_servers claim: UsageMax has no OAuth authorization server
  // or token endpoint. The bearer credential is a proprietary collector token.
  // UsageMax currently accepts a proprietary, write-only collector credential.
  // It is intentionally not advertised as an OAuth access token or delegated API.
  x_usagemax_authentication: {
    collector_token: "umx_ prefix, installation-bound, write-only",
    collector_scopes: ["telemetry:write", "outcomes:write"],
    oauth_delegation: false,
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
