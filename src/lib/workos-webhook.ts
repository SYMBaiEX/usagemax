const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;

function error(message: string, status: number) {
  return Response.json({ error: message }, {
    status,
    headers: { "cache-control": "no-store", "x-request-id": crypto.randomUUID() },
  });
}

export async function forwardWorkosWebhook(request: Request) {
  if (!convexSiteUrl) return error("api_not_configured", 503);
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declaredLength) || declaredLength < 0 || declaredLength > 262_144) {
    return error("payload_too_large", 413);
  }
  const body = await request.arrayBuffer();
  if (body.byteLength > 262_144) return error("payload_too_large", 413);
  const signature = request.headers.get("workos-signature");
  if (!signature) return error("signature_required", 401);
  const response = await fetch(`${convexSiteUrl}/v1/workos/events`, {
    method: "POST",
    headers: {
      "content-type": request.headers.get("content-type") ?? "application/json",
      "workos-signature": signature,
    },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  return new Response(response.body, {
    status: response.status,
    headers: {
      "cache-control": "no-store",
      "content-type": response.headers.get("content-type") ?? "application/json; charset=utf-8",
      "x-request-id": response.headers.get("x-request-id") ?? crypto.randomUUID(),
    },
  });
}
