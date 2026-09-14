import { createHash } from "node:crypto";

const MAX_SAFE_COUNTER = 1_000_000_000_000;
const MAX_SAFE_COST_MICROS = 1_000_000_000_000_000;

function number(value, maximum = MAX_SAFE_COUNTER) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(0, Math.round(value)))
    : 0;
}

function moneyMicros(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(MAX_SAFE_COST_MICROS, Math.max(0, Math.round(value * 1_000_000)))
    : 0;
}

function text(value, fallback, maximum = 120) {
  if (typeof value !== "string") return fallback;
  const clean = value.trim().replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, maximum);
  return clean || fallback;
}

function providerFor(model, source) {
  const name = model.toLowerCase();
  if (name.includes("claude")) return "anthropic";
  if (/^(?:gpt|o[1345]|codex)/.test(name) || name.includes("openai")) return "openai";
  if (name.includes("gemini")) return "google";
  if (name.includes("grok")) return "xai";
  if (name.includes("deepseek")) return "deepseek";
  return source;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeLinkCode(value) {
  const compact = text(value, "", 64).toUpperCase().replace(/\s+/g, "-");
  return /^UMX-[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){3}$/.test(compact) ? compact : null;
}

export function validHttpsUrl(value, { allowLocalhost = false } = {}) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return url.toString();
    if (allowLocalhost && url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
      return url.toString();
    }
  } catch {}
  return null;
}

function currentRows(report) {
  if (!report || typeof report !== "object" || !Array.isArray(report.daily)) {
    throw new Error("ccusage returned an unsupported report shape");
  }
  const rows = [];
  for (const rawRow of report.daily) {
    if (!rawRow || typeof rawRow !== "object") continue;
    const period = text(rawRow.period, "", 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(period)) continue;
    const agentRows = Array.isArray(rawRow.agents) && rawRow.agents.length ? rawRow.agents : [rawRow];
    for (const rawAgent of agentRows) {
      if (!rawAgent || typeof rawAgent !== "object") continue;
      const source = text(rawAgent.agent, "unknown", 60).toLowerCase();
      const breakdowns = Array.isArray(rawAgent.modelBreakdowns) && rawAgent.modelBreakdowns.length
        ? rawAgent.modelBreakdowns
        : [{
            modelName: Array.isArray(rawAgent.modelsUsed) && rawAgent.modelsUsed.length === 1 ? rawAgent.modelsUsed[0] : "mixed",
            inputTokens: rawAgent.inputTokens,
            outputTokens: rawAgent.outputTokens,
            cacheCreationTokens: rawAgent.cacheCreationTokens,
            cacheReadTokens: rawAgent.cacheReadTokens,
            cost: rawAgent.totalCost,
          }];
      for (const rawBreakdown of breakdowns) {
        if (!rawBreakdown || typeof rawBreakdown !== "object") continue;
        const model = text(rawBreakdown.modelName, "unknown", 120);
        const inputTokens = number(rawBreakdown.inputTokens);
        const outputTokens = number(rawBreakdown.outputTokens);
        const cacheWriteTokens = number(rawBreakdown.cacheCreationTokens);
        const cacheReadTokens = number(rawBreakdown.cacheReadTokens);
        const costMicros = moneyMicros(rawBreakdown.cost);
        rows.push({
          key: `${source}\u001f${period}\u001f${model}`,
          source,
          period,
          model,
          current: {
            inputTokens,
            outputTokens,
            cacheReadTokens,
            cacheWriteTokens,
            totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens,
            costMicros,
          },
        });
      }
    }
  }
  return rows;
}

export function buildDeltaPlan(report, priorSnapshots, deviceId, pricingVersion = "ccusage") {
  const snapshots = priorSnapshots && typeof priorSnapshots === "object" ? priorSnapshots : {};
  const plan = [];
  const regressions = [];
  for (const row of currentRows(report)) {
    const prior = snapshots[row.key] && typeof snapshots[row.key] === "object" ? snapshots[row.key] : {};
    const delta = {
      inputTokens: Math.max(0, row.current.inputTokens - number(prior.inputTokens)),
      outputTokens: Math.max(0, row.current.outputTokens - number(prior.outputTokens)),
      cacheReadTokens: Math.max(0, row.current.cacheReadTokens - number(prior.cacheReadTokens)),
      cacheWriteTokens: Math.max(0, row.current.cacheWriteTokens - number(prior.cacheWriteTokens)),
      totalTokens: Math.max(0, row.current.totalTokens - number(prior.totalTokens)),
      costMicros: Math.max(0, row.current.costMicros - number(prior.costMicros, MAX_SAFE_COST_MICROS)),
    };
    if (Object.keys(delta).some((key) => row.current[key] < number(prior[key], key === "costMicros" ? MAX_SAFE_COST_MICROS : MAX_SAFE_COUNTER))) {
      regressions.push(row.key);
    }
    if (delta.totalTokens === 0 && delta.costMicros === 0) continue;
    const snapshot = Object.fromEntries(Object.keys(row.current).map((key) => [
      key,
      Math.max(
        row.current[key],
        number(prior[key], key === "costMicros" ? MAX_SAFE_COST_MICROS : MAX_SAFE_COUNTER),
      ),
    ]));
    const version = sha256(`${row.key}\u001f${JSON.stringify(snapshot)}`).slice(0, 24);
    plan.push({
      snapshotKey: row.key,
      snapshot,
      event: {
        eventKey: `ccusage-v1:${deviceId}:${version}`,
        agentId: `${deviceId}:${row.source}`,
        agentName: row.source,
        eventType: "model_request",
        source: row.source,
        provider: providerFor(row.model, row.source),
        model: row.model,
        inputTokens: delta.inputTokens,
        outputTokens: delta.outputTokens,
        cacheReadTokens: delta.cacheReadTokens,
        cacheWriteTokens: delta.cacheWriteTokens,
        totalTokens: delta.totalTokens,
        costMicros: delta.costMicros,
        costBasis: "estimated",
        pricingSource: "ccusage / LiteLLM",
        pricingVersion,
        accountingMode: "usage",
        status: "ok",
        state: "synced",
        occurredAt: `${row.period}T12:00:00.000Z`,
        completeness: "estimated",
      },
    });
  }
  plan.sort((left, right) => left.event.occurredAt.localeCompare(right.event.occurredAt));
  return { plan, regressions };
}

export function batchId(deviceId, events) {
  const identity = events.map((event) => event.eventKey).join("\u001f");
  return `cli:${deviceId}:${sha256(identity).slice(0, 32)}`;
}

export function sourceSummary(report) {
  if (!report || typeof report !== "object" || !Array.isArray(report.daily)) return [];
  const sources = report.daily.flatMap((row) => {
    const agentRows = Array.isArray(row?.agents) && row.agents.length ? row.agents : [row];
    return agentRows.map((agent) => text(agent?.agent, "", 60).toLowerCase()).filter(Boolean);
  });
  return [...new Set(sources)].sort();
}
