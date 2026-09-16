const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
const TOKEN_PATTERN = /^Bearer umx_[a-f0-9]{64}$/;
const DEVICE_PATTERN = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

type ForwardOptions = {
  path: string;
  maxBytes: number;
  auth?: "optional" | "required";
  device?: "optional" | "required";
  requireJson?: boolean;
  rateLimitPolicy?: string;
};

const errorGuidance: Record<string, { message: string; hint: string }> = {
  api_not_configured: { message: "The UsageMax ingestion service is not configured.", hint: "Contact the UsageMax operator." },
  unauthorized: { message: "A valid UsageMax collector token is required.", hint: "Link this computer from https://usagemax.com/account and send the bearer token in Authorization." },
  invalid_device_id: { message: "The collector installation ID is invalid.", hint: "Send the stable UUID stored by the UsageMax CLI in x-usagemax-device-id." },
  content_type_must_be_application_json: { message: "The request body must be JSON.", hint: "Set Content-Type: application/json." },
  payload_too_large: { message: "The request body exceeds the endpoint limit.", hint: "Use the documented batch limits and split the request." },
};

function error(message: string, status: number, headers?: HeadersInit, rateLimitPolicy = "180;w=60") {
  const guidance = errorGuidance[message] ?? { message: "The collector request was rejected.", hint: "Check the response error code and the API documentation." };
  return Response.json({ error: message, message: guidance.message, hint: guidance.hint }, {
    status,
    headers: { "cache-control": "no-store", "x-request-id": crypto.randomUUID(), "x-api-version": "1", ...rateLimitHeaders(rateLimitPolicy), ...headers },
  });
}

function rateLimitHeaders(policy: string) {
  const limits = [...policy.matchAll(/(\d+);w=(\d+)/g)].map((match) => ({ limit: match[1], window: match[2] }));
  return {
    "rate-limit-policy": policy,
    ...(limits.length > 0 ? { "ratelimit-limit": limits.map(({ limit }) => limit).join(", "), "ratelimit-reset": limits.map(({ window }) => window).join(", ") } : {}),
  };
}

function safeResponseHeaders(source: Headers) {
  const headers = new Headers({ "cache-control": "no-store", "x-request-id": crypto.randomUUID(), "x-api-version": "1" });
  for (const name of ["content-type", "retry-after", "www-authenticate", "x-request-id", "rate-limit", "rate-limit-policy", "rate-limit-limit", "rate-limit-remaining", "rate-limit-reset"]) {
    const value = source.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

export async function forwardCollectorRequest(request: Request, options: ForwardOptions) {
  const rateLimitPolicy = options.rateLimitPolicy ?? "180;w=60";
  if (!convexSiteUrl) return error("api_not_configured", 503, undefined, rateLimitPolicy);

  const authorization = request.headers.get("authorization") ?? "";
  if (options.auth === "required" && !TOKEN_PATTERN.test(authorization)) {
    return error("unauthorized", 401, { "WWW-Authenticate": 'Bearer resource_metadata="https://usagemax.com/.well-known/oauth-protected-resource"' }, rateLimitPolicy);
  }
  if (options.auth === "optional" && authorization && !TOKEN_PATTERN.test(authorization)) {
    return error("unauthorized", 401, { "WWW-Authenticate": 'Bearer resource_metadata="https://usagemax.com/.well-known/oauth-protected-resource"' }, rateLimitPolicy);
  }

  const installationId = request.headers.get("x-usagemax-device-id") ?? "";
  if (options.device === "required" && !DEVICE_PATTERN.test(installationId)) {
    return error("invalid_device_id", 400, undefined, rateLimitPolicy);
  }
  if (options.device === "optional" && installationId && !DEVICE_PATTERN.test(installationId)) {
    return error("invalid_device_id", 400, undefined, rateLimitPolicy);
  }

  if (options.requireJson && !request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return error("content_type_must_be_application_json", 415, undefined, rateLimitPolicy);
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declaredLength) || declaredLength < 0 || declaredLength > options.maxBytes) {
    return error("payload_too_large", 413, undefined, rateLimitPolicy);
  }
  const body = request.method === "POST" ? await request.arrayBuffer() : new ArrayBuffer(0);
  if (body.byteLength > options.maxBytes) return error("payload_too_large", 413, undefined, rateLimitPolicy);

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
  if (!response.ok && response.headers.get("content-type")?.includes("application/json")) {
    const payload = await response.json().catch(() => null) as { error?: unknown } | null;
    return error(typeof payload?.error === "string" ? payload.error : "collector_request_failed", response.status, safeResponseHeaders(response.headers), rateLimitPolicy);
  }
  const responseHeaders = safeResponseHeaders(response.headers);
  for (const [name, value] of Object.entries(rateLimitHeaders(rateLimitPolicy))) {
    if (!responseHeaders.has(name)) responseHeaders.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders,
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
