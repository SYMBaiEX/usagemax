const origin = "https://usagemax.com";

const catalog = {
  linkset: [
    {
      anchor: `${origin}/.well-known/api-catalog`,
      item: [
        {
          href: `${origin}/ask`,
          type: "application/json",
          title: "UsageMax NLWeb ask endpoint",
          "http://www.w3.org/1999/xhtml#documentation": `${origin}/docs`,
        },
        {
          href: `${origin}/api/v1/telemetry/llm`,
          "http://www.w3.org/1999/xhtml#title": "Native LLM telemetry ingestion",
          "http://www.w3.org/1999/xhtml#documentation": `${origin}/docs#quickstart`,
        },
        {
          href: `${origin}/api/v1/traces`,
          "http://www.w3.org/1999/xhtml#title": "OpenTelemetry traces ingestion",
          "http://www.w3.org/1999/xhtml#documentation": `${origin}/docs#opentelemetry`,
        },
        {
          href: `${origin}/api/v2/usage/snapshots`,
          "http://www.w3.org/1999/xhtml#title": "Authoritative usage snapshots",
          "http://www.w3.org/1999/xhtml#documentation": `${origin}/docs#quickstart`,
        },
        {
          href: `${origin}/api/v1/devices/status`,
          type: "application/json",
          title: "Read-only collector credential status",
          "http://www.w3.org/1999/xhtml#documentation": `${origin}/auth.md#diagnose`,
        },
        {
          href: `${origin}/api/stats`,
          type: "application/json",
          title: "Public UsageMax network statistics",
          "http://www.w3.org/1999/xhtml#documentation": `${origin}/docs`,
        },
        {
          href: `${origin}/api/leaderboard`,
          type: "application/json",
          title: "Public UsageMax leaderboard",
          "http://www.w3.org/1999/xhtml#documentation": `${origin}/docs`,
        },
        {
          href: `${origin}/api/profiles/{handle}`,
          type: "application/json",
          title: "Public UsageMax profile",
          "http://www.w3.org/1999/xhtml#documentation": `${origin}/docs`,
        },
        {
          href: `${origin}/api/v1/sandbox/validate`,
          type: "application/json",
          title: "No-write telemetry batch validation",
          "http://www.w3.org/1999/xhtml#documentation": `${origin}/sandbox`,
        },
        {
          href: `${origin}/a2a`,
          type: "application/a2a+json",
          title: "UsageMax A2A public observability agent",
          "http://www.w3.org/1999/xhtml#documentation": `${origin}/docs`,
        },
        {
          href: `${origin}/mcp`,
          type: "application/mcp+json",
          title: "UsageMax public product MCP",
          "http://www.w3.org/1999/xhtml#documentation": `${origin}/docs`,
        },
      ],
      "service-desc": [
        {
          href: `${origin}/openapi.json`,
          type: "application/vnd.oai.openapi+json",
          title: "UsageMax OpenAPI contract",
        },
      ],
      "service-doc": [
        {
          href: `${origin}/docs`,
          type: "text/html",
          title: "UsageMax API documentation",
        },
      ],
    },
  ],
};

const headers = {
  "cache-control": "public, max-age=3600",
  "content-type": "application/linkset+json; profile=\"https://www.rfc-editor.org/info/rfc9727\"",
  link: `<${origin}/.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"; profile="https://www.rfc-editor.org/info/rfc9727"`,
};

export function GET() {
  return new Response(JSON.stringify(catalog), { headers });
}

export function HEAD() {
  return new Response(null, { headers });
}
