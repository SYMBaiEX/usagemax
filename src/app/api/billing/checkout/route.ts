import { withAuth } from "@workos-inc/authkit-nextjs";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { billingFailure, billingWorkspaceHref } from "@/lib/billing-navigation";
import { appOrigin, stripeClient, stripePriceId } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const origin = appOrigin(request);
  const fail = (code: string, status: number) => billingFailure(request, origin, code, status);
  const { user, accessToken } = await withAuth();
  if (!user || !accessToken)
    return fail("unauthorized", 401);
  const plan = new URL(request.url).searchParams.get("plan") ?? "team";
  if (plan !== "team")
    return fail("unsupported_plan", 400);
  try {
    const options = { token: accessToken };
    const overview = await fetchQuery(api.workspaces.overview, {}, options);
    if (!overview.capabilities["billing:manage"]) return fail("billing_access_required", 403);
    const existing = await fetchQuery(api.billing.get, {}, options);
    if (
      existing?.stripeSubscriptionId
      && existing.status !== "inactive"
      && existing.status !== "canceled"
    )
      return fail("billing_already_started", 409);
    const stripe = stripeClient();
    const price = stripePriceId("team");
    let customerId = existing?.stripeCustomerId ?? undefined;
    if (!customerId) {
      const billingSecret = process.env.BILLING_INTERNAL_SECRET;
      if (!billingSecret) throw new Error("billing_proof_not_configured");
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: [user.firstName, user.lastName].filter(Boolean).join(" ") || undefined,
        metadata: { workspaceId: String(overview.workspace.id), product: "usagemax" },
      }, { idempotencyKey: `usagemax-customer-${overview.workspace.id}` });
      customerId = customer.id;
      const issuedAt = Date.now();
      const proof = createHmac("sha256", billingSecret)
        .update(`${overview.workspace.id}:${customerId}:${issuedAt}`)
        .digest("hex");
      await fetchMutation(
        api.billing.setCustomer,
        { stripeCustomerId: customerId, issuedAt, proof },
        options,
      );
    }
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: String(overview.workspace.id),
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      success_url: `${origin}${billingWorkspaceHref}&billing=success`,
      cancel_url: `${origin}${billingWorkspaceHref}&billing=cancelled`,
      metadata: {
        workspaceId: String(overview.workspace.id),
        tier: "team",
      },
      subscription_data: {
        metadata: {
          workspaceId: String(overview.workspace.id),
          tier: "team",
        },
      },
    });
    if (!session.url) return fail("checkout_unavailable", 503);
    return NextResponse.redirect(session.url, 303);
  } catch (error) {
    const code = String(error).includes("stripe_price_not_configured")
      ? "billing_plan_not_configured"
      : String(error).includes("stripe_not_configured")
        ? "billing_not_configured"
        : String(error).includes("billing_proof_not_configured")
          ? "billing_not_configured"
        : "checkout_failed";
    return fail(code, code === "checkout_failed" ? 502 : 503);
  }
}
