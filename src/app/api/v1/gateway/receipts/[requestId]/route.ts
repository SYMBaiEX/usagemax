import { apiError } from "@/lib/api-response";
import { forwardGatewayRequest } from "@/lib/gateway-api";

export async function GET(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  if (!/^[A-Za-z0-9_-][A-Za-z0-9_.:-]{0,119}$/.test(requestId)) return apiError("invalid_gateway_request_id", 400);
  return forwardGatewayRequest(request, `/v1/gateway/receipts/${encodeURIComponent(requestId)}`);
}
