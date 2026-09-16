export const dynamic = "force-static";

const metadata = {
  resource: "https://usagemax.com/api",
  resource_documentation: "https://usagemax.com/auth.md",
  bearer_methods_supported: ["header"],
  // These are resource permission labels enforced on UsageMax collector
  // credentials. They are discoverable for least-privilege clients. The
  // authorization-server metadata below describes the browser sign-in entry
  // point; UsageMax does not expose an OAuth token exchange for this resource.
  scopes_supported: ["telemetry:write", "outcomes:write"],
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
