const siteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;

export const dynamic = "force-dynamic";

async function forward(request: Request) {
  if (!siteUrl) return Response.json({ error: "ingest_not_configured" }, { status: 503 });
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > 1_000_000) return Response.json({ error: "payload_too_large" }, { status: 413 });
  const body = await request.arrayBuffer();
  if (body.byteLength > 1_000_000) return Response.json({ error: "payload_too_large" }, { status: 413 });
  const response = await fetch(`${siteUrl}/v1/telemetry/llm`, {
    method: "POST",
    headers: {
      authorization: request.headers.get("authorization") ?? "",
      "content-type": request.headers.get("content-type") ?? "application/json",
      "idempotency-key": request.headers.get("idempotency-key") ?? "",
    },
    body,
    cache: "no-store",
  });
  return new Response(response.body, { status: response.status, headers: response.headers });
}

export const POST = forward;
export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type, idempotency-key",
      "access-control-allow-methods": "POST, OPTIONS",
    },
  });
}
