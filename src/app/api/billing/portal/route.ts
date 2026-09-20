import { withAuth } from "@workos-inc/authkit-nextjs";
import { fetchQuery } from "convex/nextjs";
import { NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import { appOrigin, stripeClient } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { accessToken } = await withAuth();
  if (!accessToken)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const billing = await fetchQuery(api.billing.get, {}, { token: accessToken });
    if (!billing?.stripeCustomerId)
      return NextResponse.json({ error: "billing_not_started" }, { status: 409 });
    const session = await stripeClient().billingPortal.sessions.create({
      customer: billing.stripeCustomerId,
      return_url: `${appOrigin(request)}/workspace`,
    });
    return NextResponse.redirect(session.url, 303);
  } catch {
    return NextResponse.json({ error: "billing_portal_unavailable" }, { status: 503 });
  }
}
