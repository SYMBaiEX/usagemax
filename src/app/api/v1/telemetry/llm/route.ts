import { collectorCors, forwardCollectorRequest } from "@/lib/collector-api";

export const dynamic = "force-dynamic";

function forward(request: Request) {
  return forwardCollectorRequest(request, {
    path: "/v1/telemetry/llm",
    maxBytes: 1_000_000,
    auth: "required",
    device: "required",
    requireJson: true,
  });
}

export const POST = forward;
export const OPTIONS = collectorCors;
