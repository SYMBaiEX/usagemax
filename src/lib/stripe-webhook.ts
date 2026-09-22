import type Stripe from "stripe";

export type StripeBillingSnapshot = {
  eventId: string;
  eventType: string;
  eventCreatedAt: number;
  snapshotRetrievedAt: number;
  subscriptionId: string;
  customerId: string;
  workspaceId?: string;
  priceId?: string;
  tier?: "team" | "enterprise";
  status: "inactive" | "trialing" | "active" | "past_due" | "canceled" | "incomplete" | "unpaid" | "paused";
  seatQuantity?: number;
  currentPeriodEnd?: number;
  cancelAtPeriodEnd: boolean;
  invoiceId?: string;
};

const BILLING_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as RecordValue
    : undefined;
}

function objectId(value: unknown): string | undefined {
  if (typeof value === "string" && value) return value;
  const id = record(value)?.id;
  return typeof id === "string" && id ? id : undefined;
}

export function isSupportedStripeBillingEvent(event: Stripe.Event) {
  return BILLING_EVENT_TYPES.has(event.type);
}

/** Extract only subscription IDs from the billing event shapes UsageMax handles. */
export function stripeSubscriptionIdForEvent(event: Stripe.Event): string | undefined {
  if (!isSupportedStripeBillingEvent(event)) return undefined;
  const data = record(event.data);
  const object = record(data?.object);
  if (!object) return undefined;

  if (event.type.startsWith("customer.subscription.")) {
    return objectId(object.id);
  }

  if (event.type === "checkout.session.completed") {
    return objectId(object.subscription);
  }

  const legacySubscription = objectId(object.subscription);
  if (legacySubscription) return legacySubscription;

  // Newer Stripe API versions place the subscription reference under
  // invoice.parent.subscription_details instead of invoice.subscription.
  const parent = record(object.parent);
  const details = record(parent?.subscription_details);
  return objectId(details?.subscription);
}

/**
 * Convert Stripe's freshly retrieved subscription into the deliberately small
 * projection sent to Convex. Event creation time is audit metadata only; the
 * millisecond retrieval time is the projection freshness guard.
 */
export function stripeBillingSnapshot(
  event: Stripe.Event,
  subscription: Stripe.Subscription,
  snapshotRetrievedAt = Date.now(),
): StripeBillingSnapshot {
  if (!isSupportedStripeBillingEvent(event)) throw new Error("unsupported_billing_event");
  if (!Number.isSafeInteger(snapshotRetrievedAt) || snapshotRetrievedAt <= 0)
    throw new Error("invalid_snapshot_time");

  const subscriptionRecord = subscription as unknown as RecordValue;
  const customerId = objectId(subscriptionRecord.customer);
  const subscriptionId = objectId(subscriptionRecord.id);
  if (!customerId || !subscriptionId) throw new Error("invalid_subscription_snapshot");

  const items = record(subscriptionRecord.items);
  const firstItem = Array.isArray(items?.data) ? record(items.data[0]) : undefined;
  const price = record(firstItem?.price);
  const metadata = record(subscriptionRecord.metadata);
  const statusValue = subscriptionRecord.status;
  const status = statusValue === "trialing" || statusValue === "active" || statusValue === "past_due"
      || statusValue === "canceled" || statusValue === "incomplete" || statusValue === "unpaid"
      || statusValue === "paused"
    ? statusValue
    : statusValue === "incomplete_expired"
      ? "canceled"
      : "inactive";
  const periodEnd = firstItem?.current_period_end ?? subscriptionRecord.current_period_end;
  const eventObject = record(record(event.data)?.object);
  const workspaceId = typeof metadata?.workspaceId === "string" && metadata.workspaceId.length <= 128
    ? metadata.workspaceId
    : undefined;
  const tier = metadata?.tier === "enterprise" || metadata?.tier === "team"
    ? metadata.tier
    : undefined;

  return {
    eventId: event.id,
    eventType: event.type,
    eventCreatedAt: event.created * 1000,
    snapshotRetrievedAt,
    subscriptionId,
    customerId,
    ...(workspaceId ? { workspaceId } : {}),
    ...(typeof price?.id === "string" ? { priceId: price.id } : {}),
    ...(tier ? { tier } : {}),
    status,
    ...(typeof firstItem?.quantity === "number" ? { seatQuantity: firstItem.quantity } : {}),
    ...(typeof periodEnd === "number" ? { currentPeriodEnd: periodEnd * 1000 } : {}),
    cancelAtPeriodEnd: subscriptionRecord.cancel_at_period_end === true,
    ...(event.type.startsWith("invoice.") && typeof eventObject?.id === "string"
      ? { invoiceId: eventObject.id }
      : {}),
  };
}

/**
 * Keep webhook delivery available while Vercel and Convex deploy separately.
 * An older Convex deployment has only the raw Stripe webhook route; use that
 * signed legacy contract only when the new snapshot route is absent (404).
 */
export async function deliverStripeBillingSnapshot({
  convexSiteUrl,
  body,
  rawEvent,
  stripeSignature,
  issuedAt,
  handoffSignature,
  fetcher = fetch,
}: {
  convexSiteUrl: string;
  body: string;
  rawEvent: string;
  stripeSignature: string;
  issuedAt: string;
  handoffSignature: string;
  fetcher?: typeof fetch;
}) {
  const snapshotResponse = await fetcher(`${convexSiteUrl}/v1/billing/stripe-sync`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-usagemax-issued-at": issuedAt,
      "x-usagemax-signature": handoffSignature,
    },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (snapshotResponse.status !== 404) return snapshotResponse;

  return fetcher(`${convexSiteUrl}/v1/billing/stripe-webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": stripeSignature },
    body: rawEvent,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
}
