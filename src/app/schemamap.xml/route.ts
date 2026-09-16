export const dynamic = "force-static";

const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:sf="http://schema.org/schemas/schemafeed/0.1">
  <url>
    <loc>https://usagemax.com/schema-feed.jsonl</loc>
    <lastmod>2026-09-16</lastmod>
    <sf:contentType>structuredData/schema.org</sf:contentType>
  </url>
</urlset>
`;
const headers = {
  "cache-control": "public, max-age=3600",
  "content-type": "application/xml; charset=utf-8",
};

export function GET() {
  return new Response(body, { headers });
}

export function HEAD() {
  return new Response(null, { headers });
}
