import { forwardGatewayRequest } from "@/lib/gateway-api";

export async function POST(request: Request) {
  return forwardGatewayRequest(request, "/v1/gateway/evals");
}
