import { withAuth } from "@workos-inc/authkit-nextjs";
import { fetchQuery } from "convex/nextjs";
import { NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { billingAccountHref, billingFailure, billingWorkspaceHref } from "@/lib/billing-navigation";
import { appOrigin, stripeClient } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const origin = appOrigin(request);
  const fail = (code: string, status: number) => billingFailure(request, origin, code, status);
  const { accessToken } = await withAuth();
  if (!accessToken)
    return fail("unauthorized", 401);
  try {
    const options = { token: accessToken };
    const overview = await fetchQuery(api.workspaces.overview, {}, options);
    if (!overview.capabilities["billing:manage"]) return fail("billing_access_required", 403);
    const billing = await fetchQuery(api.billing.get, {}, options);
    if (!billing?.stripeCustomerId)
      return fail("billing_not_started", 409);
    const destination = new URL(request.url).searchParams.get("flow") === "account" ? billingAccountHref : billingWorkspaceHref;
    const session = await stripeClient().billingPortal.sessions.create({
      customer: billing.stripeCustomerId,
      return_url: `${origin}${destination}`,
    });
    return NextResponse.redirect(session.url, 303);
  } catch {
    return fail("billing_portal_unavailable", 503);
  }
}
