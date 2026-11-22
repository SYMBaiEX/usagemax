// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import fixtureBaseline from "../../evals/gateway-smoke-baseline.json";
import fixtureInput from "../../evals/gateway-smoke-fixture.json";
import suite from "../../evals/gateway-smoke-v1.json";
import { baselineSchema, compareBaseline, datasetSchema, evaluate, observationSchema, observeSonnely } from "./gateway";

const dataset = datasetSchema.parse(suite);
const baseline = baselineSchema.parse(fixtureBaseline);
const fixture = fixtureInput.map((row) => observationSchema.parse(row));

describe("gateway eval gate", () => {
  it("passes the named fixture baseline and omits content from the report", () => {
    const report = evaluate(dataset, fixture, "fixture");
    expect(compareBaseline(report, baseline)).toEqual([]);
    expect(report.routes.map((route) => route.passed)).toEqual([2, 2]);
    expect(JSON.stringify(report)).not.toContain("PONG");
    expect(JSON.stringify(report)).not.toContain("prompt");
  });

  it("fails quality and measurement regressions, even when the other route still passes", () => {
    const rows = fixture.map((row) => row.routeId === "near-flash" && row.caseId === "json-answer"
      ? { ...row, text: '{"answer":"4"}', latencyMs: 501, chargedMicrousd: 26, outputTokens: 23 }
      : row);
    expect(compareBaseline(evaluate(dataset, rows, "fixture"), baseline)).toEqual([
      "near-flash/json-answer regressed in quality.",
      "near-flash/json-answer exceeded the latency budget.",
      "near-flash/json-answer exceeded the charge budget.",
      "near-flash/json-answer exceeded the token budget.",
    ]);
  });

  it("requires complete observations and a matching baseline scope", () => {
    expect(() => evaluate(dataset, [...fixture.slice(0, 3), fixture[0]], "fixture")).toThrow("each route and case");
    expect(compareBaseline(evaluate(dataset, fixture, "sonnely"), baseline)).toHaveLength(1);
    expect(compareBaseline(evaluate(dataset, fixture, "fixture"), { ...baseline, datasetVersion: "2" })).toHaveLength(1);
  });
});

describe("Sonnely evaluation adapter", () => {
  const route = dataset.routes[0];
  const item = dataset.cases[0];

  function reply(provider: string) {
    return Response.json({
      choices: [{ message: { content: "PONG" } }],
      usage: { prompt_tokens: 0, completion_tokens: 4 },
      sonnely_receipt: { version: "v1", provider, requested_model: route.model, charged_microusd: 0 },
    });
  }

  it("pins the named provider, bounds the request charge, and measures reported zeroes", async () => {
    const send = vi.fn<typeof fetch>(async () => reply(route.provider));
    await expect(observeSonnely(route, item, "fixture-key", send)).resolves.toMatchObject({
      routeId: route.id, caseId: item.id, inputTokens: 0, outputTokens: 4, chargedMicrousd: 0,
    });
    const [url, request] = send.mock.calls[0];
    expect(url).toBe("https://sonnely.com/api/sonnely/v1/chat/completions");
    expect(request?.redirect).toBe("error");
    expect(JSON.parse(String(request?.body))).toMatchObject({
      model: route.model, provider: { only: [route.provider] }, max_cost_microusd: 5000,
    });
  });

  it("rejects a response attributed to another provider", async () => {
    await expect(observeSonnely(route, item, "fixture-key", async () => reply("tinfoil")))
      .rejects.toThrow("matching usage and charge evidence");
  });
});
