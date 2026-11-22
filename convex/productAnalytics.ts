import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import { httpAction, internalMutation, internalQuery } from "./_generated/server";
import { DAY_MS, dayFromTimestamp, jsonResponse, sha256, trailingDayCutoff } from "./lib";
import { consumeCliAnalyticsQuota } from "./rateLimits";
import { cliAnalyticsArch, cliAnalyticsPlatform } from "./schema";

const MAX_BODY_BYTES = 512;
const RECEIPT_DAYS = 2;
const AGGREGATE_DAYS = 30;
const PURGE_BATCH = 100;
const MAX_SUMMARY_ROWS = 2_000;
const VERSION = /^(?:0|[1-9][0-9]{0,5})\.(?:0|[1-9][0-9]{0,5})\.(?:0|[1-9][0-9]{0,5})$/;
const DAILY_ID = /^[a-f0-9]{64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const payloadFields = ["schemaVersion", "day", "dailyId", "cliVersion", "platform", "arch"];
const dimensions = {
  day: v.string(),
  cliVersion: v.string(),
  platform: cliAnalyticsPlatform,
  arch: cliAnalyticsArch,
};
const breakdownRow = v.object({ ...dimensions, installations: v.number() });

async function boundedBody(request: Request) {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) return null;
  const bytes = new Uint8Array(MAX_BODY_BYTES);
  const reader = request.body?.getReader();
  if (!reader) return bytes.subarray(0, 0);
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) return bytes.subarray(0, size);
      if (size + next.value.byteLength > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      bytes.set(next.value, size);
      size += next.value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
}

function parsePayload(bytes: Uint8Array, now: number) {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== payloadFields.length || !payloadFields.every((key) => Object.hasOwn(value, key))) return null;
  const { schemaVersion, day, dailyId, cliVersion, platform, arch } = value as Record<string, unknown>;
  if (schemaVersion !== 1 || typeof day !== "string" || typeof dailyId !== "string" || typeof cliVersion !== "string") return null;
  if (day !== dayFromTimestamp(now) && day !== dayFromTimestamp(now - DAY_MS)) return null;
  if (!DAILY_ID.test(dailyId) || !VERSION.test(cliVersion)) return null;
  const acceptedPlatform = cliAnalyticsPlatform.members.find((entry) => entry.value === platform)?.value;
  const acceptedArch = cliAnalyticsArch.members.find((entry) => entry.value === arch)?.value;
  if (!acceptedPlatform || !acceptedArch) return null;
  return { day, dailyId, cliVersion, platform: acceptedPlatform, arch: acceptedArch };
}

export const ingestCliAnalytics = httpAction(async (ctx, request) => {
  if (["authorization", "cookie", "x-usagemax-device-id"].some((name) => request.headers.has(name))) {
    return jsonResponse({ error: "unexpected_credentials" }, 400);
  }
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return jsonResponse({ error: "content_type_must_be_application_json" }, 415);
  }
  const body = await boundedBody(request).catch(() => undefined);
  if (body === null) return jsonResponse({ error: "payload_too_large" }, 413);
  const payload = body && parsePayload(body, Date.now());
  if (!payload) return jsonResponse({ error: "invalid_cli_analytics_payload" }, 400);
  const { dailyId, ...fields } = payload;
  const dailyIdHash = await sha256(`${fields.day}:${dailyId}`);
  const retryAfterMs: number | null = await ctx.runMutation(internal.productAnalytics.record, { ...fields, dailyIdHash });
  if (retryAfterMs !== null) {
    return jsonResponse({ error: "rate_limited" }, 429, { "retry-after": String(Math.max(1, Math.ceil(retryAfterMs / 1000))) });
  }
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
});

export const record = internalMutation({
  args: { ...dimensions, dailyIdHash: v.string() },
  returns: v.union(v.number(), v.null()),
  handler: async (ctx, { day, dailyIdHash, cliVersion, platform, arch }) => {
    const quota = await consumeCliAnalyticsQuota(ctx);
    if (!quota.ok) return quota.retryAfter;
    const receipt = await ctx.db.query("cliAnalyticsReceipts")
      .withIndex("by_day_and_dailyIdHash", (q) => q.eq("day", day).eq("dailyIdHash", dailyIdHash))
      .unique();
    if (receipt) return null;

    // Distribute writes to the same version and platform across eight counters.
    const shard = Number.parseInt(dailyIdHash[0], 16) % 8;
    const counter = await ctx.db.query("cliAnalyticsDaily")
      .withIndex("by_day_and_cliVersion_and_platform_and_arch_and_shard", (q) =>
        q.eq("day", day).eq("cliVersion", cliVersion).eq("platform", platform).eq("arch", arch).eq("shard", shard))
      .unique();
    await ctx.db.insert("cliAnalyticsReceipts", { day, dailyIdHash });
    if (counter) await ctx.db.patch("cliAnalyticsDaily", counter._id, { installations: counter.installations + 1 });
    else await ctx.db.insert("cliAnalyticsDaily", { day, cliVersion, platform, arch, shard, installations: 1 });
    return null;
  },
});

export const summary = internalQuery({
  args: { throughDay: v.string(), days: v.optional(v.number()) },
  returns: v.object({
    throughDay: v.string(),
    daily: v.array(v.object({ day: v.string(), installations: v.number() })),
    breakdown: v.array(breakdownRow),
    truncated: v.boolean(),
  }),
  handler: async (ctx, { throughDay, days = 7 }) => {
    const end = Date.parse(`${throughDay}T00:00:00.000Z`);
    if (!DAY.test(throughDay) || !Number.isFinite(end) || dayFromTimestamp(end) !== throughDay) {
      throw new ConvexError("INVALID_ANALYTICS_DAY");
    }
    if (!Number.isInteger(days) || days < 1 || days > AGGREGATE_DAYS) {
      throw new ConvexError("INVALID_ANALYTICS_RANGE");
    }
    const start = trailingDayCutoff(end, days);
    const rows = await ctx.db.query("cliAnalyticsDaily")
      .withIndex("by_day_and_cliVersion_and_platform_and_arch_and_shard", (q) => q.gte("day", start).lte("day", throughDay))
      .order("desc")
      .take(MAX_SUMMARY_ROWS + 1);
    const daily = new Map<string, number>();
    const breakdown = new Map<string, typeof breakdownRow.type>();
    for (const { day, cliVersion, platform, arch, installations } of rows.slice(0, MAX_SUMMARY_ROWS)) {
      daily.set(day, (daily.get(day) ?? 0) + installations);
      const key = `${day}/${cliVersion}/${platform}/${arch}`;
      const row = breakdown.get(key);
      if (row) row.installations += installations;
      else breakdown.set(key, { day, cliVersion, platform, arch, installations });
    }
    return {
      throughDay,
      daily: [...daily].map(([day, installations]) => ({ day, installations })),
      breakdown: [...breakdown.values()],
      truncated: rows.length > MAX_SUMMARY_ROWS,
    };
  },
});

export const purgeExpired = internalMutation({
  args: {},
  returns: v.object({ receipts: v.number(), aggregates: v.number() }),
  handler: async (ctx): Promise<{ receipts: number; aggregates: number }> => {
    const now = Date.now();
    const receipts = await ctx.db.query("cliAnalyticsReceipts")
      .withIndex("by_day_and_dailyIdHash", (q) => q.lt("day", trailingDayCutoff(now, RECEIPT_DAYS)))
      .take(PURGE_BATCH);
    const aggregates = await ctx.db.query("cliAnalyticsDaily")
      .withIndex("by_day_and_cliVersion_and_platform_and_arch_and_shard", (q) => q.lt("day", trailingDayCutoff(now, AGGREGATE_DAYS)))
      .take(PURGE_BATCH);
    for (const receipt of receipts) await ctx.db.delete("cliAnalyticsReceipts", receipt._id);
    for (const row of aggregates) await ctx.db.delete("cliAnalyticsDaily", row._id);
    if (receipts.length === PURGE_BATCH || aggregates.length === PURGE_BATCH) {
      await ctx.scheduler.runAfter(1_000, internal.productAnalytics.purgeExpired, {});
    }
    return { receipts: receipts.length, aggregates: aggregates.length };
  },
});
