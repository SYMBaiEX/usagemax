import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const path = "/v1/cli-analytics";
const payload = {
  schemaVersion: 1,
  day: "2026-11-21",
  dailyId: "a".repeat(64),
  cliVersion: "0.3.14",
  platform: "darwin",
  arch: "arm64",
};

describe("CLI product analytics", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-21T12:00:00Z"));
    t = convexTest(schema, modules);
    rateLimiterTest.register(t);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function post(data: unknown, headers: Record<string, string> = {}) {
    return t.fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(data),
    });
  }

  test("counts each daily installation once and keeps only daily receipts and aggregate dimensions", async () => {
    expect((await post(payload, { "user-agent": "fixture", "x-forwarded-for": "192.0.2.1" })).status).toBe(204);
    expect((await post({ ...payload, cliVersion: "0.3.15", platform: "linux" })).status).toBe(204);
    expect((await post({ ...payload, dailyId: "b".repeat(64) })).status).toBe(204);
    expect((await post({ ...payload, dailyId: "c".repeat(64), cliVersion: "0.3.15", platform: "linux", arch: "x64" })).status).toBe(204);
    expect((await post({ ...payload, day: "2026-11-20" })).status).toBe(204);

    const summary = await t.query(internal.productAnalytics.summary, { throughDay: payload.day, days: 2 });
    expect(summary.daily).toEqual([
      { day: "2026-11-21", installations: 3 },
      { day: "2026-11-20", installations: 1 },
    ]);
    expect(summary.breakdown).toEqual(expect.arrayContaining([
      { day: payload.day, cliVersion: payload.cliVersion, platform: "darwin", arch: "arm64", installations: 2 },
      { day: payload.day, cliVersion: "0.3.15", platform: "linux", arch: "x64", installations: 1 },
      { day: "2026-11-20", cliVersion: payload.cliVersion, platform: "darwin", arch: "arm64", installations: 1 },
    ]));
    expect(summary.breakdown).toHaveLength(3);
    expect(summary.truncated).toBe(false);
    const receipts = await t.run((ctx) => ctx.db.query("cliAnalyticsReceipts").take(5));
    expect(receipts).toHaveLength(4);
    expect(new Set(receipts.map((receipt) => receipt.dailyIdHash)).size).toBe(4);
    for (const receipt of receipts) {
      expect(Object.keys(receipt).sort()).toEqual(["_creationTime", "_id", "dailyIdHash", "day"]);
      expect(receipt.dailyIdHash).not.toBe(payload.dailyId);
    }
    expect((await t.fetch(path, { method: "GET" })).status).toBe(404);
  });

  test("rejects credentials, extra fields, invalid values, and days outside the clock-skew window without writing", async () => {
    for (const invalid of [
      { ...payload, arch: undefined },
      { ...payload, schemaVersion: 2 },
      { ...payload, day: "2026-11-19" },
      { ...payload, day: "2026-11-22" },
      { ...payload, day: "2026-02-30" },
      { ...payload, dailyId: "A".repeat(64) },
      { ...payload, dailyId: "x" },
      { ...payload, cliVersion: "01.3.14" },
      { ...payload, cliVersion: "0.3.14-preview.1" },
      { ...payload, platform: "example" },
      { ...payload, arch: "sparc" },
      { ...payload, workspaceId: "unexpected" },
    ]) {
      expect((await post(invalid)).status).toBe(400);
    }
    expect(await (await post(payload, { authorization: "Bearer fixture" })).json()).toEqual({ error: "unexpected_credentials" });
    expect((await post(payload, { cookie: "fixture=value" })).status).toBe(400);
    expect((await post(payload, { "x-usagemax-device-id": "fixture" })).status).toBe(400);
    expect((await post(payload, { "content-type": "text/plain" })).status).toBe(415);
    expect((await post(payload, { "content-length": "513" })).status).toBe(413);
    expect((await t.fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: " ".repeat(513) })).status).toBe(413);
    expect((await t.fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: "{invalid" })).status).toBe(400);
    expect(await t.run((ctx) => ctx.db.query("cliAnalyticsReceipts").take(1))).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("cliAnalyticsDaily").take(1))).toEqual([]);
  });

  test("applies the global minute quota and does not count rejected requests", async () => {
    let response = await post(payload);
    expect(response.status).toBe(204);
    for (let count = 1; count <= 300 && response.status === 204; count += 1) {
      response = await post(payload);
    }
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "rate_limited" });
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await t.query(internal.productAnalytics.summary, { throughDay: payload.day })).daily).toEqual([{ day: payload.day, installations: 1 }]);
  });

  test("purges expired receipts and 30-day aggregates independently", async () => {
    await t.run(async (ctx) => {
      for (const day of ["2026-10-22", "2026-10-23", "2026-11-19", "2026-11-20", "2026-11-21"]) {
        await ctx.db.insert("cliAnalyticsReceipts", { day, dailyIdHash: "a".repeat(64) });
        await ctx.db.insert("cliAnalyticsDaily", { day, cliVersion: "0.3.14", platform: "darwin", arch: "arm64", shard: 0, installations: 1 });
      }
    });
    expect(await t.mutation(internal.productAnalytics.purgeExpired, {})).toEqual({ receipts: 3, aggregates: 1 });
    expect(await t.mutation(internal.productAnalytics.purgeExpired, {})).toEqual({ receipts: 0, aggregates: 0 });
    const summary = await t.query(internal.productAnalytics.summary, { throughDay: payload.day, days: 30 });
    expect(summary.daily.map((row) => row.day)).toEqual(["2026-11-21", "2026-11-20", "2026-11-19", "2026-10-23"]);
    await expect(t.query(internal.productAnalytics.summary, { throughDay: payload.day, days: 31 })).rejects.toThrow("INVALID_ANALYTICS_RANGE");
  });
});
