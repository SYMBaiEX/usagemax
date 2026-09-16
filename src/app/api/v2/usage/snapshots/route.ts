import { collectorCors, forwardCollectorRequest } from "@/lib/collector-api";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return forwardCollectorRequest(request, {
    path: "/v2/usage/snapshots",
    maxBytes: 2_000_000,
    auth: "required",
    device: "required",
    requireJson: true,
    rateLimitPolicy: "180;w=60, 20000;w=60",
  });
}

export const OPTIONS = collectorCors;
