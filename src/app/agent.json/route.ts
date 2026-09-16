import { agentHomepage } from "@/lib/agent-index";

export const dynamic = "force-static";

const headers = {
  "access-control-allow-origin": "*",
  "cache-control": "public, max-age=300, stale-while-revalidate=86400",
  "content-type": "application/json; charset=utf-8",
  "content-location": "https://usagemax.com/agent.json",
  link: '<https://usagemax.com/llms.txt>; rel="describedby"; type="text/plain", <https://usagemax.com/.well-known/ard.json>; rel="service"; type="application/json", <https://usagemax.com/openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json">',
};

export function GET() {
  return Response.json({ ...agentHomepage(), canonicalUrl: "https://usagemax.com/agent.json" }, { headers });
}

export function HEAD() {
  return new Response(null, { headers });
}
