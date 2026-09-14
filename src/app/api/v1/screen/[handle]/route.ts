import { apiResponse } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET() {
  return apiResponse(
    { error: "screen_api_retired", message: "The local HUD is a separate project and does not depend on UsageMax." },
    { status: 410 },
  );
}
