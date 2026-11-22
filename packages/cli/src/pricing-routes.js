// ccusage can choose another vendor's tariff when several catalog entries
// end in an unqualified ID. Route known ambiguous IDs through the direct
// provider while letting ccusage read the fresh rates and apply its tiers.
const directRoutes = new Map([
  ["grok-4.7", "xai/grok-4.7"],
  ["grok-4.7-latest", "xai/grok-4.7"],
  ["deepseek-v4.1-flash", "deepseek/deepseek-flash"],
  ["deepseek-v4.1-flash-1017", "deepseek/deepseek-flash"],
  ["DeepSeek-V4.1-Flash-1017", "deepseek/deepseek-flash"],
]);

export const PRICING_ROUTES_VERSION = "direct-v1";

export function providerPricingRoutes(env) {
  // An explicit ccusage alias configuration takes precedence, including its
  // supported delimited syntax. Pass it through without reinterpretation.
  if (env.CCUSAGE_MODEL_ALIASES?.trim()) return { env, restore: new Map() };

  const aliases = {};
  const restore = new Map();
  for (const [model, route] of directRoutes) {
    // Separate pricing aliases retain the original rows even when two raw
    // IDs refer to the same rate card, or a qualified ID is present as well.
    const alias = `usage-max-${model}/${route}`;
    aliases[model] = alias;
    aliases[`${model}-fast`] = `${model}-fast`;
    restore.set(alias, model);
  }
  return { env: { ...env, CCUSAGE_MODEL_ALIASES: JSON.stringify(aliases) }, restore };
}

export function restorePricingModelNames(report, names) {
  if (!names.size || !Array.isArray(report?.daily)) return report;
  for (const day of report.daily) {
    const reports = Array.isArray(day?.agents) && day.agents.length ? day.agents : [day];
    for (const agent of reports) {
      if (Array.isArray(agent?.modelsUsed)) {
        agent.modelsUsed = agent.modelsUsed.map((model) => names.get(model) ?? model);
      }
      for (const row of Array.isArray(agent?.modelBreakdowns) ? agent.modelBreakdowns : []) {
        const model = names.get(row?.modelName);
        if (model) row.modelName = model;
      }
    }
  }
  return report;
}
