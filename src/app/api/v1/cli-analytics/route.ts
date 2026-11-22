import { apiError } from "@/lib/api-response";
import { forwardCollectorRequest } from "@/lib/collector-api";

const documentation = "https://docs.usagemax.com/cli-analytics";

export async function POST(request: Request) {
  if (["authorization", "cookie", "x-usagemax-device-id"].some((name) => request.headers.has(name))) {
    return apiError("unexpected_credentials", 400, {
      message: "CLI analytics accepts only an installation activity signal.",
      hint: "Omit authorization, cookies, and device headers.",
      documentation,
    });
  }

  try {
    return await forwardCollectorRequest(request, {
      path: "/v1/cli-analytics",
      maxBytes: 512,
      requireJson: true,
      rateLimitPolicy: "300;w=60, 10000;w=86400",
    });
  } catch {
    return apiError("service_unavailable", 503, { documentation });
  }
}
