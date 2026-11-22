import { forwardGatewayRequest } from "@/lib/gateway-api";

export async function GET(request: Request) {
  return forwardGatewayRequest(request, "/v1/gateway/status");
}
