import { manifest } from "@/app/.well-known/ard.json/route";

export const dynamic = "force-static";

const headers = { "access-control-allow-origin": "*", "cache-control": "public, max-age=3600", "content-type": "application/json; charset=utf-8" };

export function GET() {
  return Response.json(manifest, { headers });
}

export function HEAD() {
  return new Response(null, { headers });
}
