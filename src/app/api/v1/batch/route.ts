import { apiResponse } from "@/lib/api-response";

// The descriptor GET is cacheable, but the POST alias must remain dynamic so
// Next never evaluates the request-body validator during static generation.
export const dynamic = "force-dynamic";

const descriptor = {
  name: "UsageMax batch validation",
  environment: "sandbox",
  writes: false,
  authentication: "none",
  endpoint: "https://usagemax.com/api/v1/batch",
  method: "POST",
  contentType: "application/json",
  limits: { maxBytes: 16_384, maxEvents: 100 },
  aliases: ["https://usagemax.com/api/v1/batch/validate"],
  canonicalEndpoint: "https://usagemax.com/api/v1/sandbox/validate",
  documentation: "https://usagemax.com/sandbox",
};

export function GET() {
  return apiResponse(descriptor);
}

export function HEAD() {
  return new Response(null, {
    headers: {
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=300, s-maxage=300",
      "content-type": "application/json; charset=utf-8",
      "x-api-version": "1",
    },
  });
}

// The short /batch path is a no-write compatibility alias, not an ingestion
// endpoint. Keep the implementation shared with the canonical validator so
// its limits and privacy boundary cannot drift.
export { POST } from "../sandbox/validate/route";
