import { createHmac } from "node:crypto";
import type Stripe from "stripe";
import { deliverStripeBillingSnapshot, isSupportedStripeBillingEvent, stripeBillingSnapshot, stripeSubscriptionIdForEvent } from "@/lib/stripe-webhook";
import { stripeClient } from "@/lib/stripe";

const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!convexSiteUrl)
    return Response.json({ error: "billing_not_configured" }, { status: 503 });
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const handoffSecret = process.env.BILLING_INTERNAL_SECRET;
  if (!webhookSecret || !handoffSecret)
    return Response.json({ error: "billing_not_configured" }, { status: 503 });

  const payload = await request.text();
  if (payload.length > 262_144)
    return Response.json({ error: "payload_too_large" }, { status: 413 });
  const signature = request.headers.get("stripe-signature");
  if (!signature)
    return Response.json({ error: "signature_required" }, { status: 401 });

  let stripe: ReturnType<typeof stripeClient>;
  try {
    stripe = stripeClient();
  } catch {
    return Response.json({ error: "billing_not_configured" }, { status: 503 });
  }
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch {
    return Response.json({ error: "invalid_signature" }, { status: 401 });
  }
  if (!isSupportedStripeBillingEvent(event))
    return Response.json({ ok: true, ignored: true });

  const subscriptionId = stripeSubscriptionIdForEvent(event);
  if (!subscriptionId)
    return Response.json({ ok: true, ignored: true });

  let snapshot: ReturnType<typeof stripeBillingSnapshot>;
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    snapshot = stripeBillingSnapshot(event, subscription);
  } catch {
    // A failed current-state read must not project stale event data. Let Stripe
    // retry instead of returning success with a potentially wrong plan state.
    return Response.json({ error: "billing_state_unavailable" }, { status: 503 });
  }

  const body = JSON.stringify(snapshot);
  const issuedAt = String(snapshot.snapshotRetrievedAt);
  const handoffSignature = createHmac("sha256", handoffSecret)
    .update(`${issuedAt}.${body}`)
    .digest("hex");
  let response: Response;
  try {
    response = await deliverStripeBillingSnapshot({
      convexSiteUrl,
      body,
      rawEvent: payload,
      stripeSignature: signature,
      issuedAt,
      handoffSignature,
    });
  } catch {
    return Response.json({ error: "billing_sync_unavailable" }, { status: 503 });
  }
  if (!response.ok)
    return Response.json({ error: "billing_sync_unavailable" }, { status: 503 });
  return new Response(response.body, {
    status: response.status,
    headers: {
      "cache-control": "no-store",
      "content-type": response.headers.get("content-type") ?? "application/json; charset=utf-8",
      "x-request-id": response.headers.get("x-request-id") ?? crypto.randomUUID(),
    },
  });
}
