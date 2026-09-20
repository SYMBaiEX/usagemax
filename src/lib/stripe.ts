import "server-only";

import Stripe from "stripe";

export function stripeClient() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("stripe_not_configured");
  return new Stripe(secret);
}

export function stripePriceId(plan: "team" | "enterprise") {
  const value = plan === "team"
    ? process.env.STRIPE_TEAM_PRICE_ID
    : process.env.STRIPE_ENTERPRISE_PRICE_ID;
  if (!value || !/^price_[A-Za-z0-9_]+$/.test(value))
    throw new Error("stripe_price_not_configured");
  return value;
}

export function appOrigin(request: Request) {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || new URL(request.url).origin;
}
