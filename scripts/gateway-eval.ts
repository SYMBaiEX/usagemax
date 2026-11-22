import { readFile } from "node:fs/promises";
import { z } from "zod";
import { baselineSchema, compareBaseline, datasetSchema, evaluate, observationSchema, observeSonnely } from "./evals/gateway";

async function json(path: string | URL): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function main([command, baselineFile, ...extra]: string[]) {
  if (extra.length || (command !== "fixture" && command !== "sonnely") || (command === "fixture" && baselineFile))
    throw new Error("Usage: bun scripts/gateway-eval.ts fixture | sonnely [live-baseline.json]");
  const dataset = datasetSchema.parse(await json(new URL("../evals/gateway-smoke-v1.json", import.meta.url)));
  const inputs: z.infer<typeof observationSchema>[] = [];
  const baseline = command === "fixture"
    ? baselineSchema.parse(await json(new URL("../evals/gateway-smoke-baseline.json", import.meta.url)))
    : baselineFile ? baselineSchema.parse(await json(baselineFile)) : null;
  if (baseline && (baseline.mode !== command || baseline.dataset !== dataset.id || baseline.datasetVersion !== dataset.version))
    throw new Error("Choose a baseline for the requested evaluation mode and dataset version.");
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
  console.log(JSON.stringify({ ...report, gate: baseline ? { baseline: baseline.name, passed: !regressions.length, regressions } : null }, null, 2));
  if (regressions.length) process.exitCode = 1;
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Evaluation failed.");
  process.exitCode = 1;
});
