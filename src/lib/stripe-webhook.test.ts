import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { deliverStripeBillingSnapshot, isSupportedStripeBillingEvent, stripeBillingSnapshot, stripeSubscriptionIdForEvent } from "./stripe-webhook";

function event(type: string, object: Record<string, unknown>): Stripe.Event {
  return {
    id: "evt_test_01",
    type,
    created: 1_800_000_000,
    data: { object },
  } as unknown as Stripe.Event;
}

describe("Stripe billing webhook normalization", () => {
  it("finds subscription IDs from supported event payload shapes", () => {
    expect(stripeSubscriptionIdForEvent(event("customer.subscription.updated", { id: "sub_123" })))
      .toBe("sub_123");
    expect(stripeSubscriptionIdForEvent(event("checkout.session.completed", { subscription: "sub_123" })))
      .toBe("sub_123");
    expect(stripeSubscriptionIdForEvent(event("invoice.paid", {
      parent: { subscription_details: { subscription: { id: "sub_123" } } },
    }))).toBe("sub_123");
    expect(stripeSubscriptionIdForEvent(event("invoice.payment_failed", { subscription: "sub_456" })))
      .toBe("sub_456");
    expect(stripeSubscriptionIdForEvent(event("customer.created", { id: "cus_123" })))
      .toBeUndefined();
  });

  it("projects current retrieved subscription state rather than stale event state", () => {
    const stripeEvent = event("customer.subscription.updated", {
      id: "sub_123",
      status: "active",
    });
    const snapshot = stripeBillingSnapshot(stripeEvent, {
      id: "sub_123",
      customer: { id: "cus_123" },
      status: "canceled",
      cancel_at_period_end: false,
      metadata: { workspaceId: "workspace_123", tier: "team" },
      items: {
        data: [{
          price: { id: "price_team" },
          quantity: 5,
          current_period_end: 1_800_000_060,
        }],
      },
    } as unknown as Stripe.Subscription, 1_800_000_002_000);

    expect(isSupportedStripeBillingEvent(stripeEvent)).toBe(true);
    expect(snapshot).toEqual({
      eventId: "evt_test_01",
      eventType: "customer.subscription.updated",
      eventCreatedAt: 1_800_000_000_000,
      snapshotRetrievedAt: 1_800_000_002_000,
      subscriptionId: "sub_123",
      customerId: "cus_123",
      workspaceId: "workspace_123",
      priceId: "price_team",
      tier: "team",
      status: "canceled",
      seatQuantity: 5,
      currentPeriodEnd: 1_800_000_060_000,
      cancelAtPeriodEnd: false,
    });
  });

  it("handles expired incomplete subscriptions without widening the Convex status set", () => {
    const snapshot = stripeBillingSnapshot(event("customer.subscription.deleted", { id: "sub_expired" }), {
      id: "sub_expired",
      customer: "cus_123",
      status: "incomplete_expired",
      cancel_at_period_end: false,
      metadata: {},
      items: { data: [] },
    } as unknown as Stripe.Subscription, 1_800_000_002_000);
    expect(snapshot.status).toBe("canceled");
    expect(snapshot.currentPeriodEnd).toBeUndefined();
  });

  it("uses the legacy signed webhook only while the new Convex route is absent", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      return new Response(null, { status: requests.length === 1 ? 404 : 200 });
    };

    const response = await deliverStripeBillingSnapshot({
      convexSiteUrl: "https://example.convex.site",
      body: "{\"status\":\"active\"}",
      rawEvent: "{\"id\":\"evt_safe\"}",
      stripeSignature: "t=1,v1=signed",
      issuedAt: "1800000000000",
      handoffSignature: "a".repeat(64),
      fetcher: fetcher as typeof fetch,
    });

    expect(response.status).toBe(200);
    expect(requests.map(({ url }) => url)).toEqual([
      "https://example.convex.site/v1/billing/stripe-sync",
      "https://example.convex.site/v1/billing/stripe-webhook",
    ]);
    expect(requests[0]?.init?.body).toBe("{\"status\":\"active\"}");
    expect(new Headers(requests[1]?.init?.headers).get("stripe-signature")).toBe("t=1,v1=signed");
    expect(requests[1]?.init?.body).toBe("{\"id\":\"evt_safe\"}");
  });

  it("does not fall back to stale-event processing for non-404 snapshot errors", async () => {
    const requests: string[] = [];
    const fetcher = async (input: RequestInfo | URL) => {
      requests.push(String(input));
      return new Response(null, { status: 503 });
    };
    const response = await deliverStripeBillingSnapshot({
      convexSiteUrl: "https://example.convex.site",
      body: "{}",
      rawEvent: "{}",
      stripeSignature: "t=1,v1=signed",
      issuedAt: "1800000000000",
      handoffSignature: "a".repeat(64),
      fetcher: fetcher as typeof fetch,
    });
    expect(response.status).toBe(503);
    expect(requests).toHaveLength(1);
  });
});
