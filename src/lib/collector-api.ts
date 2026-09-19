const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
const TOKEN_PATTERN = /^Bearer umx_[a-f0-9]{64}$/;
const DEVICE_PATTERN = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const API_DOCUMENTATION = "https://usagemax.com/docs";

type ForwardOptions = {
  path: string | ((request: Request) => string);
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
  const responseHeaders = new Headers({ "cache-control": "no-store", "x-request-id": crypto.randomUUID(), "x-api-version": "1", ...rateLimitHeaders(rateLimitPolicy) });
  if (headers) {
    for (const [name, value] of new Headers(headers)) responseHeaders.set(name, value);
  }
  // Generated transient errors must provide the same bounded retry signal as
  // normalized upstream errors so agents never have to guess a backoff.
  if ((status === 429 || status === 503) && !responseHeaders.has("retry-after")) {
    const firstWindow = rateLimitPolicy.match(/(?:^|,\s*)\d+;w=(\d+)/)?.[1];
    if (firstWindow) responseHeaders.set("retry-after", firstWindow);
  }
  return Response.json({ error: message, message: guidance.message, hint: guidance.hint, documentation: API_DOCUMENTATION }, {
    status,
    headers: responseHeaders,
  });
}

function rateLimitHeaders(policy: string) {
  const limits = [...policy.matchAll(/(\d+);w=(\d+)/g)].map((match) => ({ limit: match[1], window: match[2] }));
  return {
    "RateLimit-Policy": policy,
    ...(limits.length > 0 ? { "RateLimit-Limit": limits.map(({ limit }) => limit).join(", "), "RateLimit-Reset": limits.map(({ window }) => window).join(", ") } : {}),
  };
}

function safeResponseHeaders(source: Headers) {
  const headers = new Headers({ "cache-control": "no-store", "x-request-id": crypto.randomUUID(), "x-api-version": "1" });
  for (const name of ["content-type", "location", "retry-after", "www-authenticate", "x-request-id", "rate-limit", "rate-limit-policy", "rate-limit-limit", "rate-limit-remaining", "rate-limit-reset", "ratelimit-policy", "ratelimit-limit", "ratelimit-remaining", "ratelimit-reset"]) {
    const value = source.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

// The status endpoint uses HTTP 409 to report a recognized collector that is
// bound to another installation. Preserve that one safe projection through
// the public proxy; generic upstream error bodies remain normalized below.
function collectorDiagnostic(value: unknown) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (body.credentialType !== "collector" || body.writeOnly !== true || typeof body.status !== "string") return null;
  const allowed = new Set([
    "ok", "status", "credentialType", "writeOnly", "activation", "expiresAt", "scopes", "scopeStatus",
    "ingestAuthorized", "deviceBinding", "profileHandle", "deviceName", "platform", "cliVersion", "createdAt",
    "lastSeenAt", "lastSuccessAt", "lastFailureAt", "lastFailureCode",
  ]);
  return Object.fromEntries(Object.entries(body).filter(([key]) => allowed.has(key)));
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

  const upstreamPath = typeof options.path === "function" ? options.path(request) : options.path;
  const response = await fetch(`${convexSiteUrl}${upstreamPath}`, {
    method: request.method,
    headers,
    body: request.method === "POST" && body.byteLength > 0 ? body : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok && response.headers.get("content-type")?.includes("application/json")) {
    const payload = await response.json().catch(() => null) as { error?: unknown } | null;
    const diagnostic = collectorDiagnostic(payload);
    if (diagnostic) {
      const headers = safeResponseHeaders(response.headers);
      headers.set("content-type", "application/json; charset=utf-8");
      return new Response(JSON.stringify(diagnostic), { status: response.status, headers });
    }
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
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-max-age": "86400",
      "cache-control": "private, max-age=86400",
      vary: "Origin",
    },
  });
}

export function publicApiUrl(path: string) {
  return `https://usagemax.com/api${path}`;
}
