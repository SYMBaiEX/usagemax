import { apiError } from "@/lib/api-response";
import { collectorCors, forwardCollectorRequest } from "@/lib/collector-api";

export const dynamic = "force-dynamic";

function runIdFromRequest(request: Request) {
  const encoded = new URL(request.url).pathname.split("/").at(-1) ?? "";
  try {
    const runId = decodeURIComponent(encoded);
    return /^[A-Za-z0-9._:-]{1,80}$/.test(runId) ? runId : null;
  } catch {
    return null;
  }
}

export function GET(request: Request) {
  const runId = runIdFromRequest(request);
  if (!runId) return apiError("invalid_snapshot_run_id", 400);
  return forwardCollectorRequest(request, {
    path: `/v2/usage/snapshots/${encodeURIComponent(runId)}`,
    maxBytes: 0,
    auth: "required",
    device: "required",
    rateLimitPolicy: "60;w=60",
  });
}

export const OPTIONS = collectorCors;
