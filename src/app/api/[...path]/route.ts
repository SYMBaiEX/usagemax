import { apiError } from "@/lib/api-response";

export const dynamic = "force-static";

function notFound() {
  const response = apiError("api_route_not_found", 404);
  response.headers.set("allow", "GET, HEAD, OPTIONS, POST");
  response.headers.set("link", '</openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json", </api/llms.txt>; rel="describedby"; type="text/plain"');
  return response;
}

export const GET = notFound;
export const HEAD = notFound;
export const OPTIONS = notFound;
export const POST = notFound;
