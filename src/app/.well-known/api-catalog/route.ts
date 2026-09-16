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
