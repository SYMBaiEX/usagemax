import { apiError } from "@/lib/api-response";
import { forwardGatewayRequest, hasGatewayAuthorization } from "@/lib/gateway-api";

export function GET(request: Request) {
  if (!hasGatewayAuthorization(request)) return forwardGatewayRequest(request, "/v1/gateway/operations");
  const parameters = new URL(request.url).searchParams;
  const from = parameters.get("from");
  const through = parameters.get("through");
  const isoDay = /^\d{4}-\d{2}-\d{2}$/;
  if (
    parameters.size !== 2 ||
    !from || !through || !isoDay.test(from) || !isoDay.test(through)
  ) {
    return apiError("invalid_gateway_range", 400, {
      message: "Choose an inclusive UTC date range.",
      hint: "Supply from and through in YYYY-MM-DD format.",
      documentation: "https://docs.usagemax.com/gateway",
    });
  }
  const range = new URLSearchParams({ from, through });
  return forwardGatewayRequest(request, `/v1/gateway/operations?${range}`);
}
