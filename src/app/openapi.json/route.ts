import openapi from "@/lib/openapi";

export const dynamic = "force-static";

export function GET() {
  return Response.json(openapi, { headers: { "cache-control": "public, max-age=3600" } });
}
