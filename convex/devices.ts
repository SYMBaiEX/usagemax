import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

/** Device cardinality changes only on enrollment, not on every usage partition. */
export async function ensureProfileDevice(ctx: MutationCtx, collector: Doc<"collectors">, now: number) {
  const deviceHash = collector.installationIdHash ?? String(collector._id);
  let device = await ctx.db.query("profileDevices").withIndex("by_profileId_and_deviceHash", q => q.eq("profileId", collector.profileId).eq("deviceHash", deviceHash)).unique();
  if (!device && deviceHash !== String(collector._id)) {
    device = await ctx.db.query("profileDevices").withIndex("by_profileId_and_deviceHash", q => q.eq("profileId", collector.profileId).eq("deviceHash", String(collector._id))).unique();
  }
  if (device) {
    // Coarse device presence avoids rewriting one document for each historical day.
    if (device.deviceHash !== deviceHash || device.collectorId !== collector._id || now - device.lastSeenAt >= 60_000) {
      await ctx.db.patch(device._id, { deviceHash, collectorId: collector._id, lastSeenAt: now });
    }
    return device.publicLabel;
  }
  const stats = await ctx.db.query("profileStats").withIndex("by_profileId", q => q.eq("profileId", collector.profileId)).unique();
  const anyDevice = await ctx.db.query("profileDevices").withIndex("by_profileId", q => q.eq("profileId", collector.profileId)).first();
  // Opaque unique labels do not depend on a truncated count or reuse deleted labels.
  const publicLabel = `Device ${crypto.randomUUID().slice(0, 8)}`;
  await ctx.db.insert("profileDevices", { workspaceId: collector.workspaceId, profileId: collector.profileId, collectorId: collector._id, deviceHash, publicLabel, firstSeenAt: now, lastSeenAt: now });
  if (stats) await ctx.db.patch(stats._id, { deviceCount: anyDevice ? stats.deviceCount + 1 : 1 });
  return publicLabel;
}
