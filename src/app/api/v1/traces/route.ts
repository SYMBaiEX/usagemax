const siteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!siteUrl) return Response.json({ error: "ingest_not_configured" }, { status: 503 });
  const response = await fetch(`${siteUrl}/v1/traces`, {
    method: "POST",
    headers: {
      authorization: request.headers.get("authorization") ?? "",
      "content-type": request.headers.get("content-type") ?? "application/json",
      "idempotency-key": request.headers.get("idempotency-key") ?? "",
    },
    body: await request.arrayBuffer(),
    cache: "no-store",
  });
  return new Response(response.body, { status: response.status, headers: response.headers });
}
