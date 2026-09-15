import { forwardCollectorRequest } from "@/lib/collector-api";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return forwardCollectorRequest(request, {
    path: "/v1/devices/revoke",
    maxBytes: 0,
    auth: "required",
    device: "required",
  });
}
