export const dynamic = "force-static";

// UsageMax's website login is the only authorization entry point currently
// exposed. It establishes a browser session; it does not mint API bearer
// tokens. Keep this metadata explicit so agents can traverse discovery without
// inferring an unsupported OAuth token exchange.
const metadata = {
  issuer: "https://usagemax.com",
  x_usagemax_authentication: {
    browser_sign_in_endpoint: "https://usagemax.com/auth/start",
    website_session: "WorkOS AuthKit browser session; not an API bearer token",
    collector_token: "Installation-bound write-only bearer token created by the account link flow",
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
