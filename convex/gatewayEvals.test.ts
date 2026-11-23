import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";

import dataset from "../evals/gateway-smoke-v1.json";
import observations from "../evals/gateway-smoke-fixture.json";
import { datasetSchema, evaluate, observationSchema } from "../scripts/evals/gateway";
import { api, internal } from "./_generated/api";
import { DAY_MS } from "./lib";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const now = Date.parse("2026-11-22T12:00:00Z");

async function fixture() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  async function tenant(label: string) {
    const session = t.withIdentity({ subject: `user_${label}`, issuer: "https://api.workos.com/" });
    await session.mutation(api.account.ensureProfile, { handle: label });
    const { workspaceId, projectId } = await t.run(async (ctx) => {
      const profile = await ctx.db.query("profiles").withIndex("by_handle", (q) => q.eq("handle", label)).unique();
      if (!profile) throw new Error("Fixture profile missing");
      await ctx.db.patch("workspaces", profile.workspaceId, { retentionDays: 1 });
      const projectId = await ctx.db.insert("projects", {
        workspaceId: profile.workspaceId, name: "Eval fixture", key: "evals", costCenter: "", createdAt: now,
      });
      return { workspaceId: profile.workspaceId, projectId };
    });
    const ingest = await session.action(api.gatewayCredentials.issue, { projectId, name: "Fixture writer", scope: "ingest" });
    const report = await session.action(api.gatewayCredentials.issue, { projectId, name: "Fixture reader", scope: "report" });
    return { session, workspaceId, projectId, ingest, report };
  }
  const [one, two] = [await tenant("evals-owner"), await tenant("evals-other")];
  function publish(body: unknown, token?: string) {
    return t.fetch("/v1/gateway/evals", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  }
  const report = evaluate(datasetSchema.parse(dataset), observations.map((row) => observationSchema.parse(row)), "fixture");
  return { t, one, two, report, publish };
}

test("publishes fixture metadata, gates quality, and enforces project and key scopes", async () => {
  const { one, two, report, publish } = await fixture();
  const baseline = { runId: "baseline", report };
  expect((await publish(baseline)).status).toBe(401);
  expect((await publish(baseline, one.report.token)).status).toBe(403);
  expect((await publish({ ...baseline, prompt: "private text" }, one.ingest.token)).status).toBe(400);
  expect((await publish({ ...baseline, report: { ...report, routes: [
    { ...report.routes[0], results: [{ ...report.routes[0].results[0], completion: "private text" }] }, report.routes[1],
  ] } }, one.ingest.token)).status).toBe(400);
  expect(await (await publish(baseline, one.ingest.token)).json()).toEqual({ runId: "baseline", status: "accepted", gate: null });
  const reordered = { ...baseline, report: { ...report, routes: [...report.routes].reverse() } };
  expect(await (await publish(reordered, one.ingest.token)).json()).toEqual({ runId: "baseline", status: "replay", gate: null });

  const changed = structuredClone(report);
  const route = changed.routes[0];
  const passing = route.results.find((row) => row.passed)!;
  passing.passed = false;
  route.passed--;
  const candidate = { runId: "candidate", baselineRunId: "baseline", report: changed };
  expect((await publish({ runId: "baseline", report: changed }, one.ingest.token)).status).toBe(409);
  expect((await publish(candidate, two.ingest.token)).status).toBe(404);
  expect((await publish({ ...candidate, report: { ...changed, mode: "sonnely" } }, one.ingest.token)).status).toBe(409);

  const result = { runId: "candidate", status: "accepted", gate: {
    passed: false, regressions: [{ routeId: route.id, caseId: passing.caseId }],
  } };
  expect(await (await publish(candidate, one.ingest.token)).json()).toEqual(result);
  expect(await (await publish(candidate, one.ingest.token)).json()).toEqual({ ...result, status: "replay" });
  const listing = await one.session.query(api.gatewayEvals.list, { projectId: one.projectId });
  expect(listing.runs).toHaveLength(2);
  expect(listing.runs.find((run) => run.runId === "candidate")?.gate).toEqual(result.gate);
  expect(await two.session.query(api.gatewayEvals.list, { projectId: two.projectId })).toEqual({ runs: [] });
  await expect(two.session.query(api.gatewayEvals.list, { projectId: one.projectId })).rejects.toThrow("GATEWAY_PROJECT_NOT_FOUND");
});

test("filters expired runs and rejects expired baselines before retention sweeps them", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  try {
    const { t, one, report, publish } = await fixture();
    expect((await publish({ runId: "expired", report }, one.ingest.token)).status).toBe(200);
    vi.setSystemTime(now + DAY_MS + 1);
    expect(await one.session.query(api.gatewayEvals.list, { projectId: one.projectId })).toEqual({ runs: [] });
    expect((await publish({ runId: "next", baselineRunId: "expired", report }, one.ingest.token)).status).toBe(404);
    await t.mutation(internal.retention.trim, { workspaceId: one.workspaceId });
    expect(await t.run((ctx) => ctx.db.query("gatewayEvalRuns").collect())).toEqual([]);
  } finally {
    vi.useRealTimers();
  }
});
