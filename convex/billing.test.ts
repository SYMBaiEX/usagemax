import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { verifyStripeSignature } from "./billing";

const modules = import.meta.glob("./**/*.ts");

describe("Stripe webhook signatures", () => {
  it("accepts a current v1 signature over the raw payload", async () => {
    const payload = JSON.stringify({ id: "evt_test", type: "invoice.paid" });
    const timestamp = Math.floor(Date.now() / 1000);
    const secret = "whsec_test";
    const signature = createHmac("sha256", secret)
      .update(`${timestamp}.${payload}`)
      .digest("hex");
    await expect(
      verifyStripeSignature(payload, `t=${timestamp},v1=${signature}`, secret),
    ).resolves.toBe(true);
  });

  it("rejects stale, malformed, and tampered signatures", async () => {
    const payload = "{}";
    const stale = Math.floor(Date.now() / 1000) - 6 * 60;
    await expect(
      verifyStripeSignature(payload, `t=${stale},v1=${"a".repeat(64)}`, "whsec_test"),
    ).resolves.toBe(false);
    await expect(
      verifyStripeSignature(payload, "t=now,v1=not-a-signature", "whsec_test"),
    ).resolves.toBe(false);
  });

  it("projects an active subscription into the paid team policy", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({
      subject: "user_01BILLINGOWNER",
      issuer: "https://api.workos.com/",
      tokenIdentifier: "https://api.workos.com/|user_01BILLINGOWNER",
      org_id: "org_01BILLING",
      role: "admin",
      email: "billing@example.com",
    });
    await owner.mutation(api.account.ensureProfile, { handle: "billing" });
    const overview = await owner.query(api.workspaces.overview, {});
    const result = await t.mutation(internal.billing.applyStripeEvent, {
      eventId: "evt_team_active",
      eventType: "customer.subscription.created",
      eventCreatedAt: Date.now(),
      workspaceId: overview.workspace.id,
      customerId: "cus_billing_test",
      subscriptionId: "sub_billing_test",
      priceId: "price_team_test",
      tier: "team",
      status: "active",
      seatQuantity: 8,
      currentPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
      cancelAtPeriodEnd: false,
    });
    expect(result).toEqual({ replay: false, ignored: false });
    const updated = await owner.query(api.workspaces.overview, {});
    expect(updated.policy).toMatchObject({ tier: "team", members: 100, devices: 250 });
    expect(updated.billing).toMatchObject({ status: "active", seatQuantity: 8 });
  });

  it("deduplicates and ignores older Stripe events after a newer cancellation", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({
      subject: "user_01BILLINGORDER",
      issuer: "https://api.workos.com/",
      tokenIdentifier: "https://api.workos.com/|user_01BILLINGORDER",
      org_id: "org_01BILLINGORDER",
      role: "admin",
      email: "billing-order@example.com",
    });
    await owner.mutation(api.account.ensureProfile, { handle: "billing-order" });
    const workspaceId = (await owner.query(api.workspaces.overview, {})).workspace.id;
    const base = Date.now();
    await t.mutation(internal.billing.applyStripeEvent, {
      eventId: "evt_order_10",
      eventType: "customer.subscription.created",
      eventCreatedAt: base,
      workspaceId,
      customerId: "cus_billing_order",
      subscriptionId: "sub_billing_order",
      tier: "team",
      status: "active",
    });
    await t.mutation(internal.billing.applyStripeEvent, {
      eventId: "evt_order_30",
      eventType: "customer.subscription.deleted",
      eventCreatedAt: base + 2_000,
      customerId: "cus_billing_order",
      subscriptionId: "sub_billing_order",
      tier: "team",
      status: "canceled",
    });
    await expect(t.mutation(internal.billing.applyStripeEvent, {
      eventId: "evt_order_20",
      eventType: "customer.subscription.updated",
      eventCreatedAt: base + 1_000,
      customerId: "cus_billing_order",
      subscriptionId: "sub_billing_order",
      tier: "team",
      status: "active",
    })).resolves.toEqual({ replay: false, ignored: true, stale: true });
    await expect(t.mutation(internal.billing.applyStripeEvent, {
      eventId: "evt_order_20",
      eventType: "customer.subscription.updated",
      eventCreatedAt: base + 1_000,
      customerId: "cus_billing_order",
      subscriptionId: "sub_billing_order",
      tier: "team",
      status: "active",
    })).resolves.toEqual({ replay: true, ignored: false });
    const overview = await owner.query(api.workspaces.overview, {});
    expect(overview.billing?.status).toBe("canceled");
    expect(overview.policy.tier).toBe("free");
  });
});
