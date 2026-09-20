import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { audit, requireWorkspaceAccess } from "./account";

const billingStatus = v.union(
  v.literal("inactive"),
  v.literal("trialing"),
  v.literal("active"),
  v.literal("past_due"),
  v.literal("canceled"),
  v.literal("incomplete"),
  v.literal("unpaid"),
  v.literal("paused"),
);
const billingTier = v.union(v.literal("team"), v.literal("enterprise"));
type BillingStatus =
  | "inactive"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "unpaid"
  | "paused";
type BillingTier = "team" | "enterprise";

function validCustomer(value: string) {
  return /^cus_[A-Za-z0-9_]+$/.test(value) && value.length <= 100;
}

function validSubscription(value: string | undefined) {
  return !value || (/^sub_[A-Za-z0-9_]+$/.test(value) && value.length <= 100);
}

async function verifyProvisioningProof(
  workspaceId: string,
  customerId: string,
  issuedAt: number,
  proof: string,
) {
  const secret = process.env.BILLING_INTERNAL_SECRET;
  if (!secret || !Number.isSafeInteger(issuedAt)) return false;
  if (Math.abs(Date.now() - issuedAt) > 5 * 60_000) return false;
  if (!/^[a-f0-9]{64}$/i.test(proof)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const bytes = new Uint8Array(proof.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)));
  const data = new TextEncoder().encode(`${workspaceId}:${customerId}:${issuedAt}`);
  return crypto.subtle.verify("HMAC", key, bytes, data);
}

function statusValue(value: string | undefined): BillingStatus | undefined {
  if (
    value === "inactive" ||
    value === "trialing" ||
    value === "active" ||
    value === "past_due" ||
    value === "canceled" ||
    value === "incomplete" ||
    value === "unpaid" ||
    value === "paused"
  )
    return value;
  return undefined;
}

function tierValue(value: string | undefined): BillingTier | undefined {
  return value === "team" || value === "enterprise" ? value : undefined;
}

export const get = query({
  args: {},
  handler: async (ctx) => {
    const { workspace } = await requireWorkspaceAccess(ctx, "billing:read");
    const row = await ctx.db
      .query("workspaceBilling")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspace._id))
      .take(1);
    const billing = row[0];
    if (!billing) return null;
    return {
      tier: billing.tier,
      status: billing.status,
      seatQuantity: billing.seatQuantity ?? null,
      currentPeriodEnd: billing.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: billing.cancelAtPeriodEnd ?? false,
      stripeCustomerId: billing.stripeCustomerId,
      stripeSubscriptionId: billing.stripeSubscriptionId ?? null,
      stripePriceId: billing.stripePriceId ?? null,
      lastInvoiceId: billing.lastInvoiceId ?? null,
      updatedAt: billing.updatedAt,
    };
  },
});

export const setCustomer = mutation({
  args: {
    stripeCustomerId: v.string(),
    issuedAt: v.number(),
    proof: v.string(),
  },
  handler: async (ctx, args) => {
    const { workspace, user } = await requireWorkspaceAccess(
      ctx,
      "billing:manage",
    );
    if (!validCustomer(args.stripeCustomerId))
      throw new ConvexError("INVALID_STRIPE_CUSTOMER");
    if (
      !(await verifyProvisioningProof(
        String(workspace._id),
        args.stripeCustomerId,
        args.issuedAt,
        args.proof,
      ))
    )
      throw new ConvexError("INVALID_BILLING_PROOF");
    const existing = await ctx.db
      .query("workspaceBilling")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspace._id))
      .take(1);
    if (existing[0] && existing[0].stripeCustomerId !== args.stripeCustomerId)
      throw new ConvexError("STRIPE_CUSTOMER_ALREADY_LINKED");
    if (existing[0]) return existing[0]._id;
    const now = Date.now();
    const id = await ctx.db.insert("workspaceBilling", {
      workspaceId: workspace._id,
      stripeCustomerId: args.stripeCustomerId,
      tier: "team",
      status: "inactive",
      createdAt: now,
      updatedAt: now,
    });
    await audit(
      ctx,
      workspace._id,
      user._id,
      "billing.customer_linked",
      "workspace_billing",
      id,
      "Linked a Stripe customer without storing payment details",
    );
    return id;
  },
});

type StripeEventArgs = {
  eventId: string;
  eventType: string;
  workspaceId?: Id<"workspaces">;
  customerId?: string;
  subscriptionId?: string;
  priceId?: string;
  tier?: BillingTier;
  status?: BillingStatus;
  seatQuantity?: number;
  currentPeriodEnd?: number;
  cancelAtPeriodEnd?: boolean;
  invoiceId?: string;
};

export const applyStripeEvent = internalMutation({
  args: {
    eventId: v.string(),
    eventType: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    customerId: v.optional(v.string()),
    subscriptionId: v.optional(v.string()),
    priceId: v.optional(v.string()),
    tier: v.optional(billingTier),
    status: v.optional(billingStatus),
    seatQuantity: v.optional(v.number()),
    currentPeriodEnd: v.optional(v.number()),
    cancelAtPeriodEnd: v.optional(v.boolean()),
    invoiceId: v.optional(v.string()),
  },
  handler: async (ctx, args: StripeEventArgs) => {
    const prior = await ctx.db
      .query("billingEvents")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .unique();
    if (prior) return { replay: true, ignored: false };

    let billing = args.workspaceId
      ? (
          await ctx.db
            .query("workspaceBilling")
            .withIndex("by_workspaceId", (q) =>
              q.eq("workspaceId", args.workspaceId!),
            )
            .take(1)
        )[0]
      : undefined;
    if (!billing && args.subscriptionId)
      billing = await ctx.db
        .query("workspaceBilling")
        .withIndex("by_stripeSubscriptionId", (q) =>
          q.eq("stripeSubscriptionId", args.subscriptionId!),
        )
        .unique() ?? undefined;
    if (!billing && args.customerId)
      billing = await ctx.db
        .query("workspaceBilling")
        .withIndex("by_stripeCustomerId", (q) =>
          q.eq("stripeCustomerId", args.customerId!),
        )
        .unique() ?? undefined;

    const tier = tierValue(args.tier) ?? billing?.tier ?? "team";
    const status = statusValue(args.status);
    if (!billing && args.workspaceId && args.customerId && validCustomer(args.customerId)) {
      const now = Date.now();
      const id = await ctx.db.insert("workspaceBilling", {
        workspaceId: args.workspaceId,
        stripeCustomerId: args.customerId,
        stripeSubscriptionId: validSubscription(args.subscriptionId)
          ? args.subscriptionId
          : undefined,
        stripePriceId: args.priceId,
        tier,
        status: status ?? "inactive",
        seatQuantity: args.seatQuantity,
        currentPeriodEnd: args.currentPeriodEnd,
        cancelAtPeriodEnd: args.cancelAtPeriodEnd,
        lastInvoiceId: args.invoiceId,
        createdAt: now,
        updatedAt: now,
      });
      billing = (await ctx.db.get(id)) ?? undefined;
    } else if (billing) {
      if (args.customerId && args.customerId !== billing.stripeCustomerId)
        throw new ConvexError("STRIPE_CUSTOMER_CONFLICT");
      const patch: Record<string, unknown> = { updatedAt: Date.now() };
      if (validSubscription(args.subscriptionId))
        patch.stripeSubscriptionId = args.subscriptionId ?? billing.stripeSubscriptionId;
      if (args.priceId) patch.stripePriceId = args.priceId;
      if (tier) patch.tier = tier;
      if (status) patch.status = status;
      if (args.seatQuantity !== undefined) patch.seatQuantity = args.seatQuantity;
      if (args.currentPeriodEnd !== undefined) patch.currentPeriodEnd = args.currentPeriodEnd;
      if (args.cancelAtPeriodEnd !== undefined) patch.cancelAtPeriodEnd = args.cancelAtPeriodEnd;
      if (args.invoiceId) patch.lastInvoiceId = args.invoiceId;
      await ctx.db.patch(billing._id, patch);
      billing = (await ctx.db.get(billing._id)) ?? undefined;
    }

    const workspaceId = billing?.workspaceId ?? args.workspaceId;
    if (workspaceId && tier === "team" && status) {
      const workspace = await ctx.db.get(workspaceId);
      if (workspace) {
        if (status === "active" || status === "trialing") {
          if (workspace.plan !== "enterprise" && workspace.plan !== "pro")
            await ctx.db.patch(workspace._id, { plan: "pro" });
        } else if ((status === "canceled" || status === "unpaid") && workspace.plan === "pro") {
          await ctx.db.patch(workspace._id, { plan: "team" });
        }
      }
    }

    await ctx.db.insert("billingEvents", {
      eventId: args.eventId,
      type: args.eventType,
      workspaceId: billing?.workspaceId ?? args.workspaceId,
      createdAt: Date.now(),
    });
    return { replay: false, ignored: !billing };
  },
});

/** Verify Stripe's raw-body signature without importing the Node SDK into Convex. */
export async function verifyStripeSignature(
  payload: string,
  header: string,
  secret: string,
) {
  const parts = header.split(",");
  const timestamp = parts
    .find((part) => part.startsWith("t="))
    ?.slice(2);
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3))
    .filter((value) => /^[a-f0-9]{64}$/i.test(value));
  const seconds = Number(timestamp);
  if (!timestamp || !Number.isSafeInteger(seconds) || !signatures.length)
    return false;
  if (Math.abs(Date.now() - seconds * 1000) > 5 * 60_000) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const data = new TextEncoder().encode(`${timestamp}.${payload}`);
  for (const signature of signatures) {
    const bytes = new Uint8Array(signature.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)));
    if (await crypto.subtle.verify("HMAC", key, bytes, data)) return true;
  }
  return false;
}
