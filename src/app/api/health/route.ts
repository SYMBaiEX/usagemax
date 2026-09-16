import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../convex/_generated/api";
import { apiResponse } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET() {
  const [network, collector] = await Promise.all([
    fetchQuery(api.public.network, {}),
    fetchQuery(api.public.collectorCapabilities, {}),
  ]);
  return apiResponse({
    ok: true,
    service: "usagemax",
    storage: "convex",
    realtime: true,
    collector,
    updatedAt: network?.updatedAt ?? null,
  });
}
