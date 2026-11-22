import { isDeepStrictEqual } from "node:util";
import { z } from "zod";

const identifier = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/);
const count = z.int().nonnegative();
const model = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,99}$/);
const provider = z.enum(["near-ai", "phala", "tinfoil"]);
const mode = z.enum(["fixture", "sonnely"]);
const measurement = {
  inputTokens: count,
  outputTokens: count,
  chargedMicrousd: count,
  latencyMs: count,
};

const route = z.strictObject({ id: identifier, provider, model });
const evalCase = z.strictObject({
  id: identifier,
  prompt: z.string().min(1).max(500),
  assertion: z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("text"), expected: z.string().max(500) }),
    z.strictObject({ type: z.literal("json"), expected: z.json() }),
  ]),
});

export const datasetSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: identifier,
  version: identifier,
  synthetic: z.literal(true),
  routes: z.array(route).length(2),
  cases: z.array(evalCase).min(1).max(20),
}).refine((dataset) => new Set(dataset.cases.map((item) => item.id)).size === dataset.cases.length, {
  error: "Case IDs must be unique.",
}).refine((dataset) => new Set(dataset.routes.map((item) => item.id)).size === dataset.routes.length &&
  new Set(dataset.routes.map((item) => item.provider + "/" + item.model)).size === dataset.routes.length, {
  error: "Route IDs and provider/model pairs must be distinct.",
});

export const observationSchema = z.strictObject({
  routeId: identifier,
  caseId: identifier,
  text: z.string().max(8_192),
  ...measurement,
});

export const baselineSchema = z.strictObject({
  name: identifier,
  mode,
  dataset: identifier,
  datasetVersion: identifier,
  evaluator: z.string(),
  routes: z.array(route.extend({
    passingCaseIds: z.array(identifier),
    maxLatencyMs: count,
    maxChargedMicrousd: count,
    maxTotalTokens: count,
  })).length(2),
});

type Dataset = z.infer<typeof datasetSchema>;
type Observation = z.infer<typeof observationSchema>;
type Baseline = z.infer<typeof baselineSchema>;
type Route = z.infer<typeof route>;
type EvalCase = z.infer<typeof evalCase>;
type Mode = z.infer<typeof mode>;
const evaluator = "deterministic-v1";

function passes(assertion: EvalCase["assertion"], output: string) {
  if (assertion.type === "text") return output.trim() === assertion.expected;
  try {
    return isDeepStrictEqual(JSON.parse(output), assertion.expected);
  } catch {
    return false;
  }
}

export function evaluate(dataset: Dataset, inputs: Observation[], mode: Mode) {
  const indexed = new Map(inputs.map((input) => [input.routeId + "/" + input.caseId, input]));
  const expected = dataset.routes.length * dataset.cases.length;
  if (indexed.size !== expected || inputs.length !== expected)
    throw new Error("Expected exactly one observation for each route and case.");
  const routes = dataset.routes.map((route) => {
    const results = dataset.cases.map((item) => {
      const observation = indexed.get(route.id + "/" + item.id);
      if (!observation) throw new Error("Missing observation for " + route.id + "/" + item.id + ".");
      const { inputTokens, outputTokens, chargedMicrousd, latencyMs } = observation;
      return {
        caseId: item.id, passed: passes(item.assertion, observation.text),
        inputTokens, outputTokens, chargedMicrousd, latencyMs,
      };
    });
    return {
      ...route,
      passed: results.filter((result) => result.passed).length,
      total: results.length,
      results,
    };
  });
  return { mode, dataset: dataset.id, datasetVersion: dataset.version, evaluator, routes };
}

export function compareBaseline(report: ReturnType<typeof evaluate>, baseline: Baseline) {
  if (baseline.mode !== report.mode || baseline.dataset !== report.dataset ||
      baseline.datasetVersion !== report.datasetVersion || baseline.evaluator !== report.evaluator)
    return ["The baseline must match the evaluation mode, dataset version, and evaluator."];
  const baselineRoutes = new Map(baseline.routes.map((route) => [route.id, route]));
  const regressions: string[] = [];
  for (const route of report.routes) {
    const policy = baselineRoutes.get(route.id);
    if (!policy || policy.provider !== route.provider || policy.model !== route.model) {
      regressions.push(route.id + " has no matching baseline route.");
      continue;
    }
    const cases = new Map(route.results.map((result) => [result.caseId, result]));
    for (const caseId of policy.passingCaseIds) {
      if (cases.get(caseId)?.passed !== true) regressions.push(route.id + "/" + caseId + " regressed in quality.");
    }
    for (const result of route.results) {
      const prefix = route.id + "/" + result.caseId;
      if (result.latencyMs > policy.maxLatencyMs) regressions.push(prefix + " exceeded the latency budget.");
      if (result.chargedMicrousd > policy.maxChargedMicrousd) regressions.push(prefix + " exceeded the charge budget.");
      if (result.inputTokens + result.outputTokens > policy.maxTotalTokens) regressions.push(prefix + " exceeded the token budget.");
    }
  }
  return regressions;
}

const liveCompletionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().max(8_192) }) })).min(1),
  usage: z.object({ prompt_tokens: count, completion_tokens: count }),
  sonnely_receipt: z.object({
    version: z.literal("v1"),
    provider,
    requested_model: model,
    charged_microusd: count.max(5000),
  }),
});

export async function observeSonnely(route: Route, item: EvalCase, apiKey: string, send = fetch) {
  const started = performance.now();
  const response = await send("https://sonnely.com/api/sonnely/v1/chat/completions", {
    method: "POST",
    headers: { authorization: "Bearer " + apiKey, "content-type": "application/json", "x-sonnely-receipt": "v1" },
    body: JSON.stringify({
      model: route.model,
      provider: { only: [route.provider] },
      messages: [{ role: "user", content: item.prompt }],
      max_tokens: 64,
      max_cost_microusd: 5000,
      stream: false,
    }),
    redirect: "error",
    signal: AbortSignal.timeout(50_000),
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error(route.id + "/" + item.id + " returned HTTP " + response.status + ".");
  }
  const reply = liveCompletionSchema.safeParse(await response.json());
  if (!reply.success || reply.data.sonnely_receipt.provider !== route.provider ||
      reply.data.sonnely_receipt.requested_model !== route.model)
    throw new Error(route.id + "/" + item.id + " did not return matching usage and charge evidence.");
  return observationSchema.parse({
    routeId: route.id,
    caseId: item.id,
    text: reply.data.choices[0].message.content,
    inputTokens: reply.data.usage.prompt_tokens,
    outputTokens: reply.data.usage.completion_tokens,
    chargedMicrousd: reply.data.sonnely_receipt.charged_microusd,
    latencyMs: Math.round(performance.now() - started),
  });
}
