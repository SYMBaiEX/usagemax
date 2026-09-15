import { ConvexError } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

// Membership checks close ingestion immediately; queued cleanup is not an auth boundary.
export async function assertCollectorMembership(
  ctx: MutationCtx,
  collector: Doc<"collectors">,
) {
  const workspace = await ctx.db.get(collector.workspaceId);
  if (!workspace || workspace.accessDisabledAt)
    throw new ConvexError("INVALID_COLLECTOR");
  if (!workspace.workosOrganizationId || !collector.ownerUserId) return;
  const member = await ctx.db
    .query("workspaceMemberships")
    .withIndex("by_userId_and_workspaceId", (q) =>
      q.eq("userId", collector.ownerUserId!).eq("workspaceId", workspace._id),
    )
    .unique();
  if (member?.status !== "active") throw new ConvexError("INVALID_COLLECTOR");
}
