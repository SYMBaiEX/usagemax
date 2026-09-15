import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import { audit, requireWorkspaceAccess } from "./account";
import { validMoney, validCurrency } from "./productPolicy";

const state = v.union(
  v.literal("proposed"),
  v.literal("approved"),
  v.literal("measuring"),
  v.literal("verified"),
  v.literal("dismissed"),
);
export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccess(ctx, "finance:read");
    return await ctx.db
      .query("savingsActions")
      .withIndex("by_workspaceId_and_state", (q) =>
        q.eq("workspaceId", workspace._id),
      )
      .paginate(args.paginationOpts);
  },
});
export const save = mutation({
  args: {
    id: v.optional(v.id("savingsActions")),
    title: v.string(),
    description: v.string(),
    evidence: v.string(),
    currency: v.string(),
    potentialMicros: v.number(),
    observedMicros: v.optional(v.number()),
    baseline: v.optional(v.string()),
    resultEvidence: v.optional(v.string()),
    state,
  },
  handler: async (ctx, args) => {
    const { workspace, user } = await requireWorkspaceAccess(
      ctx,
      "finance:manage",
    );
    if (
      !args.title.trim() ||
      args.title.length > 100 ||
      args.description.length > 1000 ||
      !args.evidence.trim() ||
      args.evidence.length > 1000 ||
      (args.baseline?.length ?? 0) > 1000 ||
      (args.resultEvidence?.length ?? 0) > 1000 ||
      !validCurrency(args.currency) ||
      !validMoney(args.potentialMicros) ||
      (args.observedMicros !== undefined &&
        !validMoney(args.observedMicros, true))
    )
      throw new ConvexError("INVALID_SAVINGS_EVIDENCE");
    const previous = args.id ? await ctx.db.get(args.id) : null;
    if (args.id && previous?.workspaceId !== workspace._id)
      throw new ConvexError("SAVINGS_NOT_FOUND");
    if (
      args.state === "verified" &&
      (!args.baseline?.trim() ||
        !args.resultEvidence?.trim() ||
        args.observedMicros === undefined ||
        !previous ||
        !["measuring", "verified"].includes(previous.state))
    )
      throw new ConvexError("MEASUREMENT_AND_BASELINE_REQUIRED");
    if (!previous && args.state !== "proposed")
      throw new ConvexError("START_WITH_PROPOSAL");
    const { id: requestedId, ...fields } = args;
    const id = requestedId
      ? (await ctx.db.patch(requestedId, { ...fields, updatedAt: Date.now() }),
        requestedId)
      : await ctx.db.insert("savingsActions", {
          workspaceId: workspace._id,
          ...fields,
          ownerId: user._id,
          createdBy: user._id,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
    await audit(
      ctx,
      workspace._id,
      user._id,
      `savings.${args.state}`,
      "savings",
      id,
      "Savings workflow updated; potential is not counted as verified savings",
    );
    return id;
  },
});
