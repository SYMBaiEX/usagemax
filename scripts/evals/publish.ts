import { z } from "zod";
import type { evaluate } from "./gateway";

const productionOrigin = "https://usagemax.com";
const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
const identifier = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/);
const responseSchema = z.strictObject({
  runId: identifier,
  status: z.enum(["accepted", "replay"]),
  gate: z.strictObject({
    passed: z.boolean(),
    regressions: z.array(z.strictObject({ routeId: identifier, caseId: identifier })).max(40),
  }).nullable(),
});

type Publication = { key: string; endpoint: URL; runId: string; baselineRunId?: string };

export function hostedEvalConfig(env: Readonly<Record<string, string | undefined>>): Publication | null {
  const key = env.USAGEMAX_GATEWAY_EVAL_INGEST_KEY;
  if (key === undefined) return null;
  if (!/^umxg_[a-f0-9]{64}$/.test(key)) throw new Error("Set USAGEMAX_GATEWAY_EVAL_INGEST_KEY to a UsageMax Gateway ingest key.");

  const runId = env.USAGEMAX_GATEWAY_EVAL_RUN_ID;
  if (runId === undefined || !identifier.safeParse(runId).success)
    throw new Error("Set USAGEMAX_GATEWAY_EVAL_RUN_ID to a stable run identifier for publication.");
  const baselineRunId = env.USAGEMAX_GATEWAY_EVAL_BASELINE_RUN_ID || undefined;
  if (baselineRunId !== undefined && (!identifier.safeParse(baselineRunId).success || baselineRunId === runId))
    throw new Error("Set USAGEMAX_GATEWAY_EVAL_BASELINE_RUN_ID to a distinct run identifier or unset it.");

  const origin = env.USAGEMAX_GATEWAY_EVAL_BASE_URL ?? productionOrigin;
  const url = URL.parse(origin);
  const validLoopback = url && /^(http|https):$/.test(url.protocol) && loopbackHosts.has(url.hostname);
  if (!url || (origin !== url.origin && origin !== url.origin + "/") ||
      (url.origin !== productionOrigin && !validLoopback))
    throw new Error("USAGEMAX_GATEWAY_EVAL_BASE_URL must be https://usagemax.com or an explicit loopback origin.");

  return { key, endpoint: new URL("/api/v1/gateway/evals", url), runId, baselineRunId };
}

export async function publishHostedEval(config: Publication, report: ReturnType<typeof evaluate>, send = fetch) {
  const { endpoint, key, runId, baselineRunId } = config;
  let response: Response;
  try {
    response = await send(endpoint, {
      method: "POST",
      headers: { authorization: "Bearer " + key, "content-type": "application/json" },
      body: JSON.stringify({ runId, baselineRunId, report }),
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("Hosted eval publication could not reach UsageMax.");
  }
  if (response.status !== 200) {
    await response.body?.cancel().catch(() => {});
    throw new Error("Hosted eval publication returned HTTP " + response.status + ".");
  }
  const reply = responseSchema.safeParse(await response.json().catch(() => undefined));
  if (!reply.success || reply.data.runId !== runId || (reply.data.gate === null) !== (baselineRunId === undefined) ||
      (reply.data.gate && reply.data.gate.passed !== (reply.data.gate.regressions.length === 0)))
    throw new Error("Hosted eval publication returned an invalid result.");
  return reply.data;
}
