import { apiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

function retired(head = false) {
  const response = apiError("screen_api_retired", 410);
  response.headers.set("deprecation", "true");
  response.headers.set("sunset", "2026-12-31T00:00:00Z");
  response.headers.set("link", '</docs>; rel="successor-version"; type="text/html"');
  response.headers.set("allow", "GET, HEAD");
  if (head) return new Response(null, { status: response.status, headers: response.headers });
  return response;
}

export function GET() { return retired(); }
export function HEAD() { return retired(true); }
