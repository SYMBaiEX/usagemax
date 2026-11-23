import { v } from "convex/values";
import { z } from "zod";

const caseResult = v.object({
  caseId: v.string(), passed: v.boolean(),
  inputTokens: v.number(), outputTokens: v.number(), chargedMicrousd: v.number(), latencyMs: v.number(),
});
const routeResult = v.object({
  id: v.string(), provider: v.string(), model: v.string(),
  passed: v.number(), total: v.number(), results: v.array(caseResult),
});
export const evalReport = v.object({
  mode: v.union(v.literal("fixture"), v.literal("sonnely")),
  dataset: v.string(), datasetVersion: v.string(), evaluator: v.string(),
  routes: v.array(routeResult),
});
export const evalGate = v.union(v.null(), v.object({
  passed: v.boolean(),
  regressions: v.array(v.object({ routeId: v.string(), caseId: v.string() })),
}));
export const evalRun = v.object({
  runId: v.string(), baselineRunId: v.optional(v.string()), createdAt: v.number(),
  report: evalReport, gate: evalGate,
});
export const evalReceipt = v.object({
  runId: v.string(), status: v.union(v.literal("accepted"), v.literal("replay")), gate: evalGate,
});

export type EvalReport = typeof evalReport.type;
type EvalGate = NonNullable<typeof evalGate.type>;

const id = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/);
const counter = z.int().min(0).max(1_000_000_000_000);
const resultInput = z.strictObject({
  caseId: id, passed: z.boolean(),
  inputTokens: counter, outputTokens: counter, chargedMicrousd: counter, latencyMs: counter,
});
const routeInput = z.strictObject({
  id, provider: id,
  model: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/),
  passed: z.int().min(0).max(20), total: z.int().min(1).max(20),
  results: z.array(resultInput).min(1).max(20),
});
const input = z.strictObject({
  runId: id, baselineRunId: id.optional(),
  report: z.strictObject({
    mode: z.enum(["fixture", "sonnely"]),
    dataset: id, datasetVersion: id, evaluator: id,
    routes: z.array(routeInput).length(2),
  }) satisfies z.ZodType<EvalReport>,
});

function byId(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function parseEvalRun(value: unknown) {
  const parsed = input.safeParse(value);
  if (!parsed.success) return null;
  const { runId, baselineRunId, report } = parsed.data;
  if (runId === baselineRunId) return null;
  const routes = report.routes.map((route) => ({
    ...route, results: route.results.sort((a, b) => byId(a.caseId, b.caseId)),
  })).sort((a, b) => byId(a.id, b.id));
  const [first, second] = routes;
  if (first.id === second.id || (first.provider === second.provider && first.model === second.model)) return null;
  if (routes.some(({ passed, total, results }) => total !== results.length
    || passed !== results.filter((item) => item.passed).length
    || new Set(results.map((item) => item.caseId)).size !== results.length)) return null;
  if (first.results.length !== second.results.length
    || first.results.some(({ caseId }, index) => second.results[index].caseId !== caseId)) return null;

  return { runId, ...(baselineRunId === undefined ? {} : { baselineRunId }), report: { ...report, routes } };
}

// Both reports are normalized by parseEvalRun before persistence.
export function compareEvalRuns(report: EvalReport, baseline: EvalReport): EvalGate | null {
  if (report.mode !== baseline.mode || report.dataset !== baseline.dataset
    || report.datasetVersion !== baseline.datasetVersion || report.evaluator !== baseline.evaluator) return null;
  const regressions: EvalGate["regressions"] = [];
  for (const [index, route] of report.routes.entries()) {
    const previous = baseline.routes[index];
    if (!previous || route.id !== previous.id || route.model !== previous.model || route.provider !== previous.provider
      || route.results.length !== previous.results.length) return null;
    for (const [caseIndex, item] of route.results.entries()) {
      const prior = previous.results[caseIndex];
      if (item.caseId !== prior.caseId) return null;
      if (prior.passed && !item.passed) regressions.push({ routeId: route.id, caseId: item.caseId });
    }
  }
  return { passed: regressions.length === 0, regressions };
}
