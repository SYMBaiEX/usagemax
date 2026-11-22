import { forwardGatewayRequest } from "@/lib/gateway-api";

export function GET(request: Request) {
  return forwardGatewayRequest(request, "/v1/gateway/operations" + new URL(request.url).search);
}
