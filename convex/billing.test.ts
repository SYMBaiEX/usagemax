import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
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
      teamPriceVerified: true,
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

  it("ignores a newly fetched cancellation of a previously replaced subscription", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({
      subject: "user_billing_replacement",
      issuer: "https://api.workos.com/",
      tokenIdentifier: "https://api.workos.com/|user_billing_replacement",
    });
    await owner.mutation(api.account.ensureProfile, { handle: "billing-replacement" });
    const workspaceId = (await owner.query(api.workspaces.overview, {})).workspace.id;
    const timestamp = Date.now();
    const base = {
      workspaceId: String(workspaceId),
      customerId: "cus_billing_replacement",
      priceId: "price_team_test",
      tier: "team" as const,
      teamPriceVerified: true,
    };
    const apply = (eventId: string, subscriptionId: string, status: "active" | "canceled", offset: number) =>
      t.mutation(internal.billing.applyStripeEvent, {
        ...base,
        eventId,
        eventType: status === "canceled" ? "customer.subscription.deleted" : "customer.subscription.created",
        eventCreatedAt: timestamp + offset,
        snapshotRetrievedAt: timestamp + offset,
        subscriptionId,
        status,
      });

    await apply("evt_prior_active", "sub_prior", "active", 0);
    await apply("evt_prior_canceled", "sub_prior", "canceled", 1_000);
    await apply("evt_next_active", "sub_next", "active", 2_000);
    await expect(apply("evt_prior_canceled_redelivery", "sub_prior", "canceled", 3_000))
      .resolves.toEqual({ replay: false, ignored: true });
    await expect(apply("evt_prior_canceled_redelivery", "sub_prior", "canceled", 4_000))
      .resolves.toEqual({ replay: true, ignored: false });
    expect((await owner.query(api.workspaces.overview, {})).policy.tier).toBe("team");
    expect(await owner.query(api.billing.get, {}))
      .toMatchObject({ stripeSubscriptionId: "sub_next", status: "active" });
    await apply("evt_next_canceled", "sub_next", "canceled", 5_000);
    expect((await owner.query(api.workspaces.overview, {})).policy.tier).toBe("free");
  });

  it("rejects new unknown-price subscriptions and retains the known price after rotation", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({
      subject: "user_billing_price_evidence",
      issuer: "https://api.workos.com/",
      tokenIdentifier: "https://api.workos.com/|user_billing_price_evidence",
    });
    await owner.mutation(api.account.ensureProfile, { handle: "billing-price-evidence" });
    const workspaceId = (await owner.query(api.workspaces.overview, {})).workspace.id;
    const timestamp = Date.now();
    const base = {
      workspaceId: String(workspaceId),
      customerId: "cus_billing_price_evidence",
      subscriptionId: "sub_price_evidence",
      tier: "team" as const,
    };
    const apply = (eventId: string, priceId: string, teamPriceVerified: boolean, status: "active" | "canceled" | "incomplete", offset: number) =>
      t.mutation(internal.billing.applyStripeEvent, {
        ...base,
        eventId,
        eventType: "customer.subscription.updated",
        eventCreatedAt: timestamp + offset,
        snapshotRetrievedAt: timestamp + offset,
        priceId,
        teamPriceVerified,
        status,
      });

    await expect(apply("evt_unknown_incomplete", "price_other", false, "incomplete", 0))
      .resolves.toEqual({ replay: false, ignored: true });
    await expect(apply("evt_unknown_active", "price_other", false, "active", 1_000))
      .resolves.toEqual({ replay: false, ignored: true });
    expect(await owner.query(api.billing.get, {})).toBeNull();
    expect((await owner.query(api.workspaces.overview, {})).policy.tier).toBe("free");

    await apply("evt_verified_active", "price_team_test", true, "active", 2_000);
    await expect(apply("evt_existing_after_rotation", "price_team_test", false, "active", 3_000))
      .resolves.toEqual({ replay: false, ignored: false });
    expect((await owner.query(api.workspaces.overview, {})).policy.tier).toBe("team");
    await apply("evt_canceled_on_incompatible_price", "price_other", false, "canceled", 4_000);
    expect(await owner.query(api.billing.get, {}))
      .toMatchObject({ stripePriceId: "price_team_test", status: "canceled" });
    expect((await owner.query(api.workspaces.overview, {})).policy.tier).toBe("free");
  });

  it("authenticates and forwards an explicit false Price assertion to the billing projection", async () => {
    vi.useFakeTimers();
    const secret = "billing_handoff_test";
    vi.stubEnv("BILLING_INTERNAL_SECRET", secret);
    try {
      const t = convexTest(schema, modules);
      const owner = t.withIdentity({
        subject: "user_billing_handoff_price",
        issuer: "https://api.workos.com/",
        tokenIdentifier: "https://api.workos.com/|user_billing_handoff_price",
      });
      await owner.mutation(api.account.ensureProfile, { handle: "billing-handoff-price" });
      const workspaceId = (await owner.query(api.workspaces.overview, {})).workspace.id;
      const timestamp = Date.now();
      const payload = JSON.stringify({
        eventId: "evt_handoff_unknown_price",
        eventType: "customer.subscription.created",
        eventCreatedAt: timestamp,
        snapshotRetrievedAt: timestamp,
        workspaceId: String(workspaceId),
        customerId: "cus_handoff_price",
        subscriptionId: "sub_handoff_price",
        priceId: "price_other",
        teamPriceVerified: false,
        status: "active",
        cancelAtPeriodEnd: false,
      });
      const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
      const response = await t.fetch("/v1/billing/stripe-sync", {
        method: "POST",
        headers: { "x-usagemax-issued-at": String(timestamp), "x-usagemax-signature": signature },
        body: payload,
      });
      expect(response.status).toBe(202);
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(await owner.query(api.billing.get, {})).toBeNull();
    } finally {
      vi.useRealTimers();
      vi.unstubAllEnvs();
    }
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
