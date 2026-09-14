import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../convex/_generated/api";
import { apiResponse } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET() {
  const network = await fetchQuery(api.public.network, {});
  return apiResponse({
    ok: true,
    service: "usagemax",
    storage: "convex",
    realtime: true,
    updatedAt: network?.updatedAt ?? null,
  });
}
