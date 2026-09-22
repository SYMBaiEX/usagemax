import { describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

describe("workspace telemetry retention", () => {
  test("continues expiry for disabled organizations in bounded batches", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      const now = Date.now();
      await t.run(async (ctx) => {
        const workspaceId = await ctx.db.insert("workspaces", {
          slug: "disabled-tenant",
          name: "Disabled tenant",
          workosOrganizationId: "org_disabled",
          accessDisabledAt: now,
          plan: "enterprise",
          isPublic: false,
          retentionDays: 1,
          createdAt: now,
        });
        const profileId = await ctx.db.insert("profiles", {
          workspaceId,
          handle: "disabled-tenant",
          displayName: "Disabled tenant",
          bio: "",
          isPublic: false,
          isVerified: false,
          verification: "account",
          createdAt: now,
        });
        for (let i = 0; i < 101; i++) {
          await ctx.db.insert("telemetryEvents", {
            workspaceId,
            profileId,
            eventKey: `event-${i}`,
            eventHash: `hash-${i}`,
            eventType: "model_request",
            source: "test",
            provider: "openai",
            model: "test-model",
            inputTokens: 1,
            outputTokens: 0,
            cacheReadTokens: 0,
            reasoningTokens: 0,
            totalTokens: 1,
            costMicros: 0,
            status: "ok",
            occurredAt: now - 10 * 86_400_000,
            receivedAt: now - 10 * 86_400_000,
            schemaVersion: 1,
            completeness: "reported",
          });
        }
      });

      await expect(t.mutation(internal.retention.trim, {
        workspaceId: await t.run(async (ctx) => {
          const workspace = await ctx.db.query("workspaces").unique();
          if (!workspace) throw new Error("workspace missing");
          return workspace._id;
        }),
      })).resolves.toMatchObject({ removed: 100 });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      await expect(t.run((ctx) => ctx.db.query("telemetryEvents").collect())).resolves.toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
