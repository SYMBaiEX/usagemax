import { apiResponse } from "@/lib/api-response";

export const dynamic = "force-static";

const descriptor = {
  name: "UsageMax batch validation",
  environment: "sandbox",
  writes: false,
  authentication: "none",
  endpoint: "https://usagemax.com/api/v1/batch/validate",
  method: "POST",
  contentType: "application/json",
  limits: { maxBytes: 16_384, maxEvents: 100 },
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
