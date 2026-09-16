export const dynamic = "force-static";

const body = `User-agent: *
Allow: /

Sitemap: https://usagemax.com/sitemap.xml
schemamap: https://usagemax.com/schemamap.xml
`;
const headers = {
  "cache-control": "public, max-age=3600",
  "content-type": "text/plain; charset=utf-8",
};

export function GET() {
  return new Response(body, { headers });
}

export function HEAD() {
  return new Response(null, { headers });
}
