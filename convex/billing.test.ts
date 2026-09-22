import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { verifyStripeSnapshotSignature } from "./billing";

const modules = import.meta.glob("./**/*.ts");

describe("signed billing snapshot handoff", () => {
  it("verifies a short-lived normalized snapshot handoff", async () => {
    const payload = JSON.stringify({ eventId: "evt_test", status: "active" });
    const timestamp = String(Date.now());
    const secret = "billing_handoff_test";
    const signature = createHmac("sha256", secret)
      .update(`${timestamp}.${payload}`)
      .digest("hex");
    await expect(verifyStripeSnapshotSignature(payload, timestamp, signature, secret)).resolves.toBe(true);
    await expect(verifyStripeSnapshotSignature(payload, timestamp, signature, "wrong_secret")).resolves.toBe(false);
    await expect(verifyStripeSnapshotSignature(payload, "1.8e12", signature, secret)).resolves.toBe(false);
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
      snapshotRetrievedAt: Date.now(),
      workspaceId: String(overview.workspace.id),
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

  it("deduplicates by event ID and projects current state independent of Stripe event ordering", async () => {
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
      eventId: "evt_order_30",
      eventType: "customer.subscription.created",
      eventCreatedAt: base,
      snapshotRetrievedAt: base,
      workspaceId: String(workspaceId),
      customerId: "cus_billing_order",
      subscriptionId: "sub_billing_order",
      tier: "team",
      status: "active",
    });
    await t.mutation(internal.billing.applyStripeEvent, {
      eventId: "evt_order_10",
      eventType: "customer.subscription.updated",
      eventCreatedAt: base,
      snapshotRetrievedAt: base + 1_000,
      customerId: "cus_billing_order",
      subscriptionId: "sub_billing_order",
      tier: "team",
      status: "canceled",
    });
    await expect(t.mutation(internal.billing.applyStripeEvent, {
      eventId: "evt_order_10",
      eventType: "customer.subscription.updated",
      eventCreatedAt: base,
      snapshotRetrievedAt: base + 1_000,
      customerId: "cus_billing_order",
      subscriptionId: "sub_billing_order",
      tier: "team",
      status: "canceled",
    })).resolves.toEqual({ replay: true, ignored: false });
    await expect(t.mutation(internal.billing.applyStripeEvent, {
      eventId: "evt_order_20",
      eventType: "customer.subscription.updated",
      eventCreatedAt: base - 10_000,
      snapshotRetrievedAt: base + 2_000,
      customerId: "cus_billing_order",
      subscriptionId: "sub_billing_order",
      tier: "team",
      status: "canceled",
    })).resolves.toEqual({ replay: false, ignored: false });
    await expect(t.mutation(internal.billing.applyStripeEvent, {
      eventId: "evt_order_stale_snapshot",
      eventType: "customer.subscription.updated",
      eventCreatedAt: base + 30_000,
      snapshotRetrievedAt: base + 500,
      customerId: "cus_billing_order",
      subscriptionId: "sub_billing_order",
      tier: "team",
      status: "active",
    })).resolves.toEqual({ replay: false, ignored: true, stale: true });
    const overview = await owner.query(api.workspaces.overview, {});
    expect(overview.billing?.status).toBe("canceled");
    expect(overview.policy.tier).toBe("free");
  });

  it("does not recreate billing metadata for a deleted workspace from late Stripe metadata", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({
      subject: "user_01BILLINGDELETED",
      issuer: "https://api.workos.com/",
      tokenIdentifier: "https://api.workos.com/|user_01BILLINGDELETED",
      org_id: "org_01BILLINGDELETED",
      role: "admin",
      email: "billing-deleted@example.com",
    });
    await owner.mutation(api.account.ensureProfile, { handle: "billing-deleted" });
    const workspaceId = (await owner.query(api.workspaces.overview, {})).workspace.id;
    await t.run(async (ctx) => ctx.db.delete(workspaceId));

    const result = await t.mutation(internal.billing.applyStripeEvent, {
      eventId: "evt_after_workspace_delete",
      eventType: "customer.subscription.updated",
      eventCreatedAt: Date.now(),
      snapshotRetrievedAt: Date.now(),
      workspaceId: String(workspaceId),
      customerId: "cus_late_billing_event",
      subscriptionId: "sub_late_billing_event",
      tier: "team",
      status: "canceled",
      cancelAtPeriodEnd: false,
    });
    expect(result).toEqual({ replay: false, ignored: true });
    const rows = await t.run(async (ctx) => ctx.db.query("workspaceBilling").collect());
    expect(rows).toEqual([]);
  });
});
