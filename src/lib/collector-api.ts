const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
const TOKEN_PATTERN = /^Bearer umx_[a-f0-9]{64}$/;
const DEVICE_PATTERN = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

type ForwardOptions = {
  path: string;
  maxBytes: number;
  auth?: "optional" | "required";
  device?: "optional" | "required";
  requireJson?: boolean;
};

function error(message: string, status: number, headers?: HeadersInit) {
  return Response.json({ error: message }, {
    status,
    headers: { "cache-control": "no-store", ...headers },
  });
}

function safeResponseHeaders(source: Headers) {
  const headers = new Headers({ "cache-control": "no-store" });
  for (const name of ["content-type", "retry-after", "x-request-id"]) {
    const value = source.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

export async function forwardCollectorRequest(request: Request, options: ForwardOptions) {
  if (!convexSiteUrl) return error("api_not_configured", 503);

  const authorization = request.headers.get("authorization") ?? "";
  if (options.auth === "required" && !TOKEN_PATTERN.test(authorization)) {
    return error("unauthorized", 401);
  }
  if (options.auth === "optional" && authorization && !TOKEN_PATTERN.test(authorization)) {
    return error("unauthorized", 401);
  }

  const installationId = request.headers.get("x-usagemax-device-id") ?? "";
  if (options.device === "required" && !DEVICE_PATTERN.test(installationId)) {
    return error("invalid_device_id", 400);
  }
  if (options.device === "optional" && installationId && !DEVICE_PATTERN.test(installationId)) {
    return error("invalid_device_id", 400);
  }

  if (options.requireJson && !request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return error("content_type_must_be_application_json", 415);
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declaredLength) || declaredLength < 0 || declaredLength > options.maxBytes) {
    return error("payload_too_large", 413);
  }
  const body = request.method === "POST" ? await request.arrayBuffer() : new ArrayBuffer(0);
  if (body.byteLength > options.maxBytes) return error("payload_too_large", 413);

  const headers = new Headers();
  if (authorization) headers.set("authorization", authorization);
  if (installationId) headers.set("x-usagemax-device-id", installationId);
  for (const name of ["content-type", "idempotency-key"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const response = await fetch(`${convexSiteUrl}${options.path}`, {
    method: request.method,
    headers,
    body: request.method === "POST" && body.byteLength > 0 ? body : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
  });
  return new Response(response.body, {
    status: response.status,
    headers: safeResponseHeaders(response.headers),
  });
}

export function collectorCors(request: Request) {
  const origin = request.headers.get("origin");
  const allowed = origin === "https://usagemax.com"
    || (process.env.NODE_ENV !== "production" && /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin ?? ""));
  if (!allowed) return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": origin!,
      "access-control-allow-headers": "authorization, content-type, idempotency-key, x-usagemax-device-id",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-max-age": "86400",
      "cache-control": "private, max-age=86400",
      vary: "Origin",
    },
  });
}

export function publicApiUrl(path: string) {
  return `https://usagemax.com/api${path}`;
}
