const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!convexSiteUrl)
    return Response.json({ error: "api_not_configured" }, { status: 503 });
  const payload = await request.text();
  if (payload.length > 262_144)
    return Response.json({ error: "payload_too_large" }, { status: 413 });
  const signature = request.headers.get("stripe-signature");
  if (!signature)
    return Response.json({ error: "signature_required" }, { status: 401 });
  const response = await fetch(`${convexSiteUrl}/v1/billing/stripe-webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signature },
    body: payload,
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
