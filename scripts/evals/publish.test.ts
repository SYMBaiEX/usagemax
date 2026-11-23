import { describe, expect, test, vi } from "vitest";
import dataset from "../../evals/gateway-smoke-v1.json";
import observations from "../../evals/gateway-smoke-fixture.json";
import { datasetSchema, evaluate, observationSchema } from "./gateway";
import { hostedEvalConfig, publishHostedEval } from "./publish";

const key = "umxg_" + "a".repeat(64);
const env = { USAGEMAX_GATEWAY_EVAL_INGEST_KEY: key, USAGEMAX_GATEWAY_EVAL_RUN_ID: "fixture-123-1" };
const report = evaluate(datasetSchema.parse(dataset), observations.map((row) => observationSchema.parse(row)), "fixture");

function reply(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status });
}

describe("hosted gateway eval publication", () => {
  test("opts in only by key and requires valid run IDs before evaluation", () => {
    expect(hostedEvalConfig({ USAGEMAX_GATEWAY_EVAL_RUN_ID: "fixture-123-1" })).toBeNull();
    expect(() => hostedEvalConfig({ ...env, USAGEMAX_GATEWAY_EVAL_INGEST_KEY: "" })).toThrow("INGEST_KEY");
    expect(() => hostedEvalConfig({ ...env, USAGEMAX_GATEWAY_EVAL_RUN_ID: undefined })).toThrow("RUN_ID");
    expect(() => hostedEvalConfig({ ...env, USAGEMAX_GATEWAY_EVAL_RUN_ID: "CASE sensitive" })).toThrow("RUN_ID");
    expect(() => hostedEvalConfig({ ...env, USAGEMAX_GATEWAY_EVAL_BASELINE_RUN_ID: env.USAGEMAX_GATEWAY_EVAL_RUN_ID })).toThrow("distinct");
    expect(hostedEvalConfig({ ...env, USAGEMAX_GATEWAY_EVAL_BASELINE_RUN_ID: "" })?.baselineRunId).toBeUndefined();
  });

  test.each([
    "https://usagemax.com.evil.example", "http://usagemax.com", "https://usagemax.com@example.com",
    "https://user@usagemax.com", "https://usagemax.com/subpath", "https://usagemax.com?key=1",
    "https://usagemax.com:8000", "https://localhost.example.com", "https://usagemax.com#local",
  ])("rejects untrusted publication origin %s", (origin) => {
    expect(() => hostedEvalConfig({ ...env, USAGEMAX_GATEWAY_EVAL_BASE_URL: origin })).toThrow("BASE_URL");
  });

  test.each(["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"])("allows explicit local integration origin %s", (origin) => {
    expect(hostedEvalConfig({ ...env, USAGEMAX_GATEWAY_EVAL_BASE_URL: origin })?.endpoint.href).toBe(origin + "/api/v1/gateway/evals");
  });

  test("publishes the exact result-only report with a project bearer and blocks redirect follow", async () => {
    const response = { runId: env.USAGEMAX_GATEWAY_EVAL_RUN_ID, status: "accepted", gate: null };
    const send = vi.fn<typeof fetch>().mockResolvedValue(reply(response));
    expect(await publishHostedEval(hostedEvalConfig(env)!, report, send)).toEqual(response);
    const [[endpoint, options]] = send.mock.calls;
    expect(String(endpoint)).toBe("https://usagemax.com/api/v1/gateway/evals");
    expect(options).toMatchObject({
      method: "POST", redirect: "error", headers: { authorization: "Bearer " + key, "content-type": "application/json" },
    });
    expect(JSON.parse(String(options?.body))).toEqual({ runId: env.USAGEMAX_GATEWAY_EVAL_RUN_ID, report });
    expect(String(options?.body)).not.toMatch(/"prompt"|"text"|"assertion"|"expected"/);
  });

  test("uses the requested baseline and keeps a replay's quality result", async () => {
    const config = hostedEvalConfig({ ...env, USAGEMAX_GATEWAY_EVAL_BASELINE_RUN_ID: "fixture-122-1" })!;
    const response = {
      runId: config.runId, status: "replay", gate: { passed: false, regressions: [{ routeId: "near-flash", caseId: "json-answer" }] },
    };
    const send = vi.fn<typeof fetch>().mockResolvedValue(reply(response));
    expect(await publishHostedEval(config, report, send)).toEqual(response);
    expect(JSON.parse(String(send.mock.calls[0][1]?.body))).toMatchObject({ baselineRunId: "fixture-122-1" });
  });

  test("fails publication on transport, HTTP, or malformed success without echoing credentials", async () => {
    const config = hostedEvalConfig(env)!;
    const send = vi.fn<typeof fetch>();
    send.mockRejectedValueOnce(new Error(key)).mockResolvedValueOnce(reply({ error: key }, 409))
      .mockResolvedValueOnce(reply({ runId: "wrong-run", status: "accepted", gate: null }));
    await expect(publishHostedEval(config, report, send)).rejects.toThrow(/^Hosted eval publication could not reach UsageMax\.$/);
    await expect(publishHostedEval(config, report, send)).rejects.toThrow(/^Hosted eval publication returned HTTP 409\.$/);
    await expect(publishHostedEval(config, report, send)).rejects.toThrow(/^Hosted eval publication returned an invalid result\.$/);
  });
});
