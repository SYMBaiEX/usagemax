import assert from "node:assert/strict";
import test from "node:test";
import { providerPricingRoutes, restorePricingModelNames } from "./pricing-routes.js";

test("routes bare Grok and DeepSeek models without combining them or rewriting explicit routes", () => {
  const { env, restore } = providerPricingRoutes({ PATH: "/bin" });
  const aliases = JSON.parse(env.CCUSAGE_MODEL_ALIASES);
  assert.equal(env.PATH, "/bin");
  assert.match(aliases["grok-4.7"], /\/xai\/grok-4\.7$/);
  assert.equal(aliases["grok-4.7-fast"], "grok-4.7-fast");
  assert.match(aliases["deepseek-v4.1-flash"], /\/deepseek\/deepseek-flash$/);
  assert.notEqual(aliases["grok-4.7"], aliases["grok-4.7-latest"]);
  assert.equal(aliases["xai/grok-4.7"], undefined);
  assert.equal(aliases["us-gov.xai.grok-4.7"], undefined);
  const names = [aliases["grok-4.7"], "us-gov.xai.grok-4.7", "xai/grok-4.7", aliases["grok-4.7-latest"]];
  const agent = { modelsUsed: names, modelBreakdowns: names.map((modelName, cost) => ({ modelName, cost })) };
  const report = { daily: [{ agents: [agent] }, { modelsUsed: [aliases["deepseek-v4.1-flash"]] }] };
  restorePricingModelNames(report, restore);
  assert.deepEqual(agent.modelsUsed, ["grok-4.7", "us-gov.xai.grok-4.7", "xai/grok-4.7", "grok-4.7-latest"]);
  assert.deepEqual(agent.modelBreakdowns, agent.modelsUsed.map((modelName, cost) => ({ modelName, cost })));
  assert.deepEqual(report.daily[1].modelsUsed, ["deepseek-v4.1-flash"]);
});

test("preserves explicit custom ccusage alias configuration", () => {
  const env = { CCUSAGE_MODEL_ALIASES: "custom=azure/model" };
  assert.deepEqual(providerPricingRoutes(env), { env, restore: new Map() });
});
