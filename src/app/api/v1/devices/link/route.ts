import { forwardCollectorRequest, publicApiUrl } from "@/lib/collector-api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const response = await forwardCollectorRequest(request, {
    path: "/v1/devices/link",
    maxBytes: 16_384,
    auth: "optional",
    device: "optional",
    requireJson: true,
    rateLimitPolicy: "3000;w=60, 3;w=60",
  });
  if (!response.ok) return response;
  const payload = await response.json();
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store");
  return Response.json({
    ...payload,
    ingestUrl: publicApiUrl("/v1/telemetry/llm"),
    snapshotUrl: publicApiUrl("/v2/usage/snapshots"),
    statusUrl: publicApiUrl("/v1/devices/status"),
    revokeUrl: publicApiUrl("/v1/devices/revoke"),
  }, { status: response.status, headers });
}
