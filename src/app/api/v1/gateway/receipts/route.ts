import { forwardGatewayRequest } from "@/lib/gateway-api";

const path = "/v1/gateway/receipts";

export async function GET(request: Request) {
  const parameters = new URL(request.url).searchParams;
  const report = new URLSearchParams();
  for (const name of ["from", "through", "limit"]) {
    for (const value of parameters.getAll(name)) report.append(name, value);
  }
  return forwardGatewayRequest(request, `${path}?${report}`);
}

export async function POST(request: Request) {
  return forwardGatewayRequest(request, path);
}
