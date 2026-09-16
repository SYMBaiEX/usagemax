import { apiError } from "@/lib/api-response";

export const dynamic = "force-static";

const authMetadata = 'Bearer resource_metadata="https://usagemax.com/.well-known/oauth-protected-resource"';

function response() {
  const result = apiError("api_root", 401);
  result.headers.set("WWW-Authenticate", authMetadata);
  result.headers.set("Allow", "GET, HEAD");
  result.headers.set("Link", '</openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json", </api/llms.txt>; rel="describedby"; type="text/plain"');
  return result;
}
export function GET() {
  return response();
}

export function HEAD() {
  return response();
}
