import { apiError } from "./api-response";

const MAX_RECEIPT_BATCH_BYTES = 64 * 1024;
const GUIDE = "https://docs.usagemax.com/gateway";
const TOKEN = /^Bearer umxg_[a-f0-9]{64}$/;

function gatewayError(error: string, status: number, message: string, hint: string) {
  return apiError(error, status, { message, hint, documentation: GUIDE });
}

export function hasGatewayAuthorization(request: Request) {
  return TOKEN.test(request.headers.get("authorization") ?? "");
}

export async function forwardGatewayRequest(request: Request, path: string) {
  const authorization = request.headers.get("authorization");
  if (!authorization || !TOKEN.test(authorization)) {
    return gatewayError("unauthorized", 401, "A gateway key is required.", "Use a private project gateway key with the required scope.");
  }
  const upstream = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (!upstream) {
    return gatewayError("service_unavailable", 503, "Gateway ingestion is unavailable.", "Retry later.");
  }
  const headers = new Headers({ authorization });
  let body: ArrayBuffer | undefined;
  if (request.method === "POST") {
    const contentType = request.headers.get("content-type");
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentType?.split(";")[0].trim().toLowerCase() !== "application/json") {
      return gatewayError("content_type_must_be_application_json", 415, "The batch must be JSON.", "Send Content-Type: application/json.");
    }
    if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > MAX_RECEIPT_BATCH_BYTES) {
      return gatewayError("payload_too_large", 413, "The batch exceeds 64 KiB.", "Split the batch and retry.");
    }
    headers.set("content-type", contentType);
    body = await request.arrayBuffer().catch(() => undefined);
    if (!body) return gatewayError("invalid_request", 400, "The batch could not be read.", "Send a JSON body.");
    if (body.byteLength > MAX_RECEIPT_BATCH_BYTES) {
      return gatewayError("payload_too_large", 413, "The batch exceeds 64 KiB.", "Split the batch and retry.");
    }
  }
  try {
    const result = await fetch(new URL(path, upstream), {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
    const responseHeaders = new Headers({ "cache-control": "private, no-store", "vary": "authorization" });
    for (const name of ["content-type", "x-request-id", "retry-after"]) {
      const value = result.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new Response(result.body, { status: result.status, headers: responseHeaders });
  } catch {
    return gatewayError("service_unavailable", 503, "Gateway reporting is unavailable.", "Retry later.");
  }
}
