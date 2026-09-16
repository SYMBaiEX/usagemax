import { forwardCollectorRequest } from "@/lib/collector-api";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return forwardCollectorRequest(request, {
    path: "/v1/devices/status",
    maxBytes: 0,
    auth: "required",
    device: "optional",
    rateLimitPolicy: "60;w=60",
  });
}
