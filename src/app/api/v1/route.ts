import { apiError } from "@/lib/api-response";

export const dynamic = "force-static";

const authMetadata = 'Bearer resource_metadata="https://usagemax.com/.well-known/oauth-protected-resource"';

function response() {
  const result = apiError("api_v1_root", 401);
  result.headers.set("WWW-Authenticate", authMetadata);
  result.headers.set("Allow", "GET, HEAD");
  result.headers.set("Link", '</openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json", </api/llms.txt>; rel="describedby"; type="text/plain", </.well-known/oauth-protected-resource>; rel="protected-resource"; type="application/json"');
  return result;
}

function headResponse() {
  const result = response();
  return new Response(null, { status: result.status, headers: result.headers });
}

export function GET() {
  return response();
}

export function HEAD() {
  return headResponse();
}
