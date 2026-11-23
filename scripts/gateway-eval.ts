import { readFile } from "node:fs/promises";
import { z } from "zod";
import syntheticDataset from "../evals/gateway-smoke-v1.json";
import { baselineSchema, compareBaseline, datasetSchema, evaluate, gatewayEvaluator, observationSchema, observeSonnely } from "./evals/gateway";
import { hostedEvalConfig, publishHostedEval } from "./evals/publish";

async function json(path: string | URL): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function main([command, baselineFile, ...extra]: string[]) {
  if (extra.length || (command !== "fixture" && command !== "sonnely") ||
      (command === "fixture" && baselineFile !== undefined) ||
      (command === "sonnely" && !baselineFile?.trim()))
    throw new Error("Usage: bun scripts/gateway-eval.ts fixture | sonnely <live-baseline.json | --measure>");
  const publication = hostedEvalConfig(process.env);
  const dataset = datasetSchema.parse(syntheticDataset);
  const inputs: z.infer<typeof observationSchema>[] = [];
  const measuring = command === "sonnely" && baselineFile === "--measure";
  const baseline = command === "fixture"
    ? baselineSchema.parse(await json(new URL("../evals/gateway-smoke-baseline.json", import.meta.url)))
    : measuring ? null : baselineSchema.parse(await json(baselineFile!));
  if (baseline) {
    const fingerprint = (routes: typeof dataset.routes) => routes
      .map(({ id, provider, model }) => id + ":" + provider + ":" + model).sort().join("\n");
    if (baseline.mode !== command || baseline.dataset !== dataset.id || baseline.datasetVersion !== dataset.version ||
        baseline.evaluator !== gatewayEvaluator || fingerprint(baseline.routes) !== fingerprint(dataset.routes))
      throw new Error("Choose a baseline for the requested mode, dataset version, evaluator, and routes.");
  }
  if (command === "fixture") {
    inputs.push(...z.array(observationSchema).max(40).parse(await json(new URL("../evals/gateway-smoke-fixture.json", import.meta.url))));
  } else {
    const key = process.env.SONNELY_EVAL_API_KEY;
    if (!key) throw new Error("SONNELY_EVAL_API_KEY is required for a live run.");
    for (const route of dataset.routes) {
      for (const item of dataset.cases) inputs.push(await observeSonnely(route, item, key));
    }
  }
  const report = evaluate(dataset, inputs, command);
  const regressions = baseline ? compareBaseline(report, baseline) : [];
  const gate = baseline ? { baseline: baseline.name, passed: !regressions.length, regressions } : null;
  if (regressions.length || (measuring && report.routes.some((route) => route.passed < route.total)))
    process.exitCode = 1;
  let hosted: Awaited<ReturnType<typeof publishHostedEval>> | undefined;
  try {
    if (publication) hosted = await publishHostedEval(publication, report);
  } finally {
    console.log(JSON.stringify({ ...report, gate, hosted }, null, 2));
  }
  if (hosted?.gate?.passed === false) process.exitCode = 1;
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Evaluation failed.");
  process.exitCode = 1;
});
