# UsageMax billing

UsageMax keeps personal usage and the small-team workspace free. Paid plans
cover workspace capacity, governance, support, and contracted controls; token
counts are never used as a hidden billable meter.

## Commercial paths

- **Free** — personal history and small-team collaboration with published
  guardrails.
- **Team** — optional monthly Stripe subscription for customers who need paid
  workspace operations. An active subscription unlocks 100 members, 50 teams,
  200 projects, 250 devices, 50 budgets, and 90 days of detailed retention.
  The recurring Price is configured with `STRIPE_TEAM_PRICE_ID`.
- **Enterprise** — a written agreement with contract-specific capacity,
  identity, retention, export, residency, and support commitments.

## Required configuration

Set these server-side values in Vercel and Convex:

- `STRIPE_SECRET_KEY` — Stripe secret key; never send to the browser.
- `STRIPE_WEBHOOK_SECRET` — the signing secret for
  `https://usagemax.com/api/webhooks/stripe`.
- `STRIPE_TEAM_PRICE_ID` — a recurring Stripe Price in the production
  currency and interval you sell.
- `BILLING_INTERNAL_SECRET` — the same high-entropy secret in Vercel and
  Convex. It signs the server-only handoff that links a newly created Stripe
  customer to a workspace; it is never returned to a browser.
- `NEXT_PUBLIC_CONVEX_SITE_URL` — the Convex site URL used by the webhook
  facade.
- `NEXT_PUBLIC_APP_URL` — normally `https://usagemax.com`.

Create the Stripe recurring product and Price before enabling the checkout
button. Keep the Price ID in deployment configuration, not in source code.

## Webhook contract

Stripe sends events to `/api/webhooks/stripe`. The Vercel route forwards the
raw request body and `stripe-signature` header to Convex, where the signature is
verified before a bounded, idempotent billing projection job is scheduled.
The endpoint acknowledges the signed event quickly; the projection job records
the Stripe event ID before applying it so retries are safe.

Handled events include checkout completion, subscription creation/update,
subscription cancellation, successful invoices, and failed invoice payments.
Duplicate event IDs are ignored. Payment details never enter Convex.

## Customer experience

Workspace administrators use **Start Team plan** to open Stripe Checkout and
**Manage billing** to open the Stripe-hosted customer portal. Checkout and
portal sessions are generated server-side only after a WorkOS-authenticated
workspace access check. Customer linking also requires a short-lived server
signature, so a caller cannot attach an arbitrary Stripe customer to its
workspace.

## Enterprise pilots

Enterprise activation remains operator-controlled. A paid pilot can be
manually invoiced while the customer-specific WorkOS identity, retention,
export, support, and capacity gates are verified. Do not claim residency,
SCIM lifecycle, immutable SIEM export, compliance certification, or an SLA
until the corresponding evidence is retained in the enterprise readiness
record.
