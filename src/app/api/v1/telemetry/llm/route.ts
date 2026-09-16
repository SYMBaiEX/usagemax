import { collectorCors, forwardCollectorRequest } from "@/lib/collector-api";

export const dynamic = "force-dynamic";

function forward(request: Request) {
  return forwardCollectorRequest(request, {
    path: "/v1/telemetry/llm",
    maxBytes: 1_000_000,
    auth: "required",
    device: "required",
    requireJson: true,
    rateLimitPolicy: "180;w=60, 20000;w=60",
  });
}

export const POST = forward;
export const OPTIONS = collectorCors;
