import { beforeEach, describe, expect, test } from "vitest";
import { convexTest } from "convex-test";

import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

describe("public usage dimensions", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    t = convexTest(schema, modules);
  });

  test("returns stable device aliases without storing hostnames in public rows", async () => {
    const now = Date.UTC(2026, 8, 14, 12);
    const ids = await t.mutation(internal.imports.begin, {
      handle: "privacy-builder",
      displayName: "Privacy Builder",
      sourceUrl: "https://example.com/profile",
      collectorKeyHash: "collector-hash",
      collectorKeyPrefix: "umx_test",
      now,
    });
    await t.mutation(internal.imports.applyDailyTotals, {
      ...ids,
      rows: [{ day: "2026-09-14", outputTokens: 20, totalTokens: 120, costMicros: 500 }],
      now,
    });
    const labels = await t.mutation(internal.imports.registerDevices, {
      ...ids,
      deviceHashes: ["salted-device-hash"],
      now,
    });
    await t.mutation(internal.imports.applyDimensions, {
      ...ids,
      dimension: "device",
      rows: [{
        day: "2026-09-14",
        key: labels[0]!.publicLabel,
        keyHash: labels[0]!.deviceHash,
        outputTokens: 20,
        totalTokens: 120,
        costMicros: 500,
      }],
      now,
    });

    const rows = await t.query(api.public.dailyBreakdown, {
      handle: "privacy-builder",
      groupBy: "device",
      days: 30,
    });
    expect(rows).toEqual([expect.objectContaining({ key: "Device 1", totalTokens: 120 })]);
    expect(JSON.stringify(rows)).not.toContain("salted-device-hash");
  });
});
