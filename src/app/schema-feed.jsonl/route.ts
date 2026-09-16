import { usageMaxSchemaFeed } from "@/lib/structured-data";

export const dynamic = "force-static";

const body = `${usageMaxSchemaFeed.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
const headers = {
  "cache-control": "public, max-age=3600",
  "content-type": "application/x-jsonlines; charset=utf-8",
};

export function GET() {
  return new Response(body, { headers });
}

export function HEAD() {
  return new Response(null, { headers });
}
