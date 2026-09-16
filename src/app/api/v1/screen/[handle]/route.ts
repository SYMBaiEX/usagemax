import { apiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET() {
  const response = apiError("screen_api_retired", 410);
  response.headers.set("deprecation", "true");
  response.headers.set("sunset", "2026-12-31T00:00:00Z");
  return response;
}
