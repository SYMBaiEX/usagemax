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
  const displayName = model.toLowerCase().replace(/^\[[^\]]+\]\s*/, "");
  const name = displayName.replace(/^api[-_:]/, "");
  if (name.startsWith("openrouter/")) return "openrouter";
  if (name.startsWith("azure/") || name.startsWith("azure-openai/")) return "azure-openai";
  if (name.startsWith("bedrock/") || name.startsWith("aws/")) return "aws-bedrock";
  if (name.startsWith("vertex/") || name.startsWith("vertex_ai/") || name.startsWith("google/")) return "google";
  if (name.includes("claude")) return "anthropic";
  if (/^(?:gpt|o[1345]|codex)/.test(name) || name.includes("openai")) return "openai";
  if (name.includes("gemini")) return "google";
  if (name.includes("grok")) return "xai";
  if (name.includes("deepseek")) return "deepseek";
  if (name.includes("kimi") || name.includes("moonshot")) return "moonshot";
  if (name.includes("qwen")) return "alibaba";
  if (name.includes("glm") || name.includes("zai") || name.includes("z.ai")) return "zai";
  if (name.includes("mistral") || name.includes("codestral")) return "mistral";
  if (name.includes("llama") || name.includes("meta/")) return "meta";
  if (name.includes("minimax")) return "minimax";
  if (name.includes("command-r") || name.includes("cohere")) return "cohere";
  return source;
}

const snapshotCounterFields = [
  "inputTokens",
  "outputTokens",
  "cacheReadTokens",
  "cacheWriteTokens",
  "reasoningTokens",
  "unclassifiedTokens",
  "totalTokens",
  "costMicros",
  "requests",
  "errors",
];

function snapshotCounters(value = {}) {
  const inputTokens = number(value.inputTokens);
  const outputTokens = number(value.outputTokens);
  const cacheReadTokens = number(value.cacheReadTokens);
  const cacheWriteTokens = number(value.cacheWriteTokens);
  const reasoningTokens = number(value.reasoningTokens);
  const suppliedTotal = number(value.totalTokens);
  const classified = inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens + reasoningTokens;
  const unclassifiedTokens = value.unclassifiedTokens === undefined
    ? Math.max(0, suppliedTotal - classified)
    : number(value.unclassifiedTokens);
  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    reasoningTokens,
    unclassifiedTokens,
    totalTokens: classified + unclassifiedTokens,
    costMicros: number(value.costMicros, MAX_SAFE_COST_MICROS),
    requests: number(value.requests),
    errors: number(value.errors),
  };
}

function sameCounters(left, right) {
  return snapshotCounterFields.every((field) => left[field] === right[field]);
}

function snapshotKey(source, period, provider, model) {
  return `${source}\u001f${period}\u001f${provider}\u001f${model}`;
}

function readSnapshotKey(key) {
  const parts = String(key).split("\u001f");
  if (parts.length === 4) return { source: parts[0], period: parts[1], provider: parts[2], model: parts[3] };
  if (parts.length === 3) return { source: parts[0], period: parts[1], provider: providerFor(parts[2], parts[0]), model: parts[2] };
  return null;
}

function normalizedSnapshotRows(report) {
  const rows = new Map();
  for (const row of currentRows(report)) {
    const provider = providerFor(row.model, row.source);
    const key = snapshotKey(row.source, row.period, provider, row.model);
    const current = snapshotCounters(row.current);
    const existing = rows.get(key);
    if (existing) {
      for (const field of snapshotCounterFields) existing.current[field] += current[field];
    } else {
      rows.set(key, {
        key,
        source: row.source,
        period: row.period,
        provider,
        model: row.model,
        current,
      });
    }
  }
  return rows;
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
      let allocatedTokens = 0;
      let allocatedCostMicros = 0;
      for (const rawBreakdown of breakdowns) {
        if (!rawBreakdown || typeof rawBreakdown !== "object") continue;
        const model = text(rawBreakdown.modelName, "unknown", 120);
        const inputTokens = number(rawBreakdown.inputTokens);
        const outputTokens = number(rawBreakdown.outputTokens);
        const cacheWriteTokens = number(rawBreakdown.cacheCreationTokens);
        const cacheReadTokens = number(rawBreakdown.cacheReadTokens);
        const costMicros = moneyMicros(rawBreakdown.cost);
        const classifiedTokens = inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens;
        const totalTokens = Math.max(classifiedTokens, number(rawBreakdown.totalTokens));
        allocatedTokens += totalTokens;
        allocatedCostMicros += costMicros;
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
            totalTokens,
            costMicros,
          },
        });
      }
      const residualTokens = Math.max(0, number(rawAgent.totalTokens) - allocatedTokens);
      const residualCostMicros = Math.max(0, moneyMicros(rawAgent.totalCost) - allocatedCostMicros);
      if (residualTokens > 0 || residualCostMicros > 0) {
        rows.push({
          key: `${source}\u001f${period}\u001funattributed`,
          source,
          period,
          model: "unattributed",
          current: {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            totalTokens: residualTokens,
            costMicros: residualCostMicros,
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
        status: "ok",
        state: "synced",
        occurredAt: `${row.period}T00:00:00.000Z`,
        completeness: "estimated",
      },
    });
  }
  plan.sort((left, right) => left.event.occurredAt.localeCompare(right.event.occurredAt));
  return { plan, regressions };
}

export function buildSnapshotPlan(report, priorSnapshots, {
  bootstrap = false,
  complete = true,
  full = false,
  pricingVersion = "ccusage",
  revision = Date.now(),
  runId = randomPlanId(),
} = {}) {
  const rows = normalizedSnapshotRows(report);
  const priorRows = new Map();
  const snapshots = priorSnapshots && typeof priorSnapshots === "object" ? priorSnapshots : {};
  for (const [rawKey, rawValue] of Object.entries(snapshots)) {
    const identity = readSnapshotKey(rawKey);
    if (!identity || !/^\d{4}-\d{2}-\d{2}$/.test(identity.period)) continue;
    const key = snapshotKey(identity.source, identity.period, identity.provider, identity.model);
    priorRows.set(key, {
      key,
      ...identity,
      current: snapshotCounters(rawValue),
    });
  }

  const currentPartitions = new Set([...rows.values()].map((row) => `${row.source}\u001f${row.period}`));
  const allKeys = new Set(rows.keys());
  for (const [key, prior] of priorRows) {
    if (full || currentPartitions.has(`${prior.source}\u001f${prior.period}`)) allKeys.add(key);
  }

  const grouped = new Map();
  // Carry forward history outside this scan's window. Only reconciled keys may
  // replace or remove a checkpoint, including legacy three-part identities.
  const nextSnapshots = Object.fromEntries([...priorRows].map(([key, row]) => [key, row.current]));
  const regressions = [];
  for (const key of allKeys) {
    const currentRow = rows.get(key);
    const priorRow = priorRows.get(key);
    const identity = currentRow || priorRow;
    if (!identity) continue;
    const previous = priorRow?.current ?? snapshotCounters();
    let current = currentRow?.current ?? snapshotCounters();
    const regressed = snapshotCounterFields.some((field) => current[field] < previous[field]);
    if (regressed) regressions.push(key);
    // A larger total can conceal a missing dimension. Keep the coherent prior
    // vector (including in the checkpoint) until coverage is authoritative.
    if (!complete && regressed) current = { ...previous };
    if (!sameCounters(current, snapshotCounters())) nextSnapshots[key] = current;
    else delete nextSnapshots[key];
    const partitionKey = `${identity.source}\u001f${identity.period}`;
    const rowsForPartition = grouped.get(partitionKey) ?? [];
    rowsForPartition.push({
      snapshotKey: key,
      provider: identity.provider,
      model: identity.model,
      previous,
      current,
      costBasis: "estimated",
      contentHash: sha256(`${key}\u001f${JSON.stringify(current)}`),
      // A daily aggregate has no exact event time. Use the start of its UTC day
      // so today's partition is valid even when the collector runs before noon.
      lastUsedAt: Date.parse(`${identity.period}T00:00:00.000Z`),
    });
    grouped.set(partitionKey, rowsForPartition);
  }

  const partitions = [];
  for (const [partitionKey, partitionRows] of grouped) {
    const [source, day] = partitionKey.split("\u001f");
    const changed = partitionRows.some((row) => !sameCounters(row.previous, row.current));
    if (!bootstrap && !full && !changed) continue;
    partitionRows.sort((left, right) => `${left.provider}/${left.model}`.localeCompare(`${right.provider}/${right.model}`));
    const wireRows = partitionRows.map(({ provider, model, previous, current, costBasis, contentHash, lastUsedAt }) => ({
      provider,
      model,
      previous,
      current,
      costBasis,
      contentHash,
      lastUsedAt,
    }));
    const chunkCount = Math.ceil(wireRows.length / 100);
    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
      const rows = wireRows.slice(chunkIndex * 100, (chunkIndex + 1) * 100);
      const payloadHash = sha256(JSON.stringify({ source, day, complete, pricingVersion, chunkIndex, chunkCount, rows }));
      partitions.push({
        partitionId: `${runId}:${sha256(partitionKey).slice(0, 24)}:${chunkIndex}`,
        payloadHash,
        revision,
        source,
        day,
        complete,
        pricingVersion,
        chunkIndex,
        chunkCount,
        rows,
      });
    }
  }
  partitions.sort((left, right) => left.day === right.day ? left.source.localeCompare(right.source) : left.day.localeCompare(right.day));
  return { partitions, nextSnapshots, regressions };
}

function randomPlanId() {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// Inventory stability certifies that repeating a successful parse is unnecessary;
// it does not certify authority to remove server history. Bootstrap is separate.
export function scanPolicy(config, inventory, { today, now, inventoryVersion, requestedFull = false, requestedArchives = false }) {
  const knownSources = Array.isArray(config.knownSources) ? config.knownSources : [];
  const lastFull = Date.parse(config.lastFullSyncAt || "");
  const bootstrap = config.snapshotProtocolVersion !== 2;
  const full = requestedFull || requestedArchives || bootstrap
    || config.sourceInventoryVersion !== inventoryVersion
    || !Number.isFinite(lastFull) || now - lastFull >= 7 * 24 * 60 * 60 * 1000
    || inventory.sources.some((source) => !knownSources.includes(source));
  const inventoryStable = inventory.complete && !inventory.truncated && inventory.errors === 0;
  const skip = !config.pendingSync && !full && inventoryStable && config.lastScanSucceeded === true
    && config.lastReconciledDay === today && config.sourceFingerprint === inventory.fingerprint;
  return { bootstrap, full, skip, inventoryStable };
}

export function buildSessionPlan(report, deviceId) {
  const sessionRows = Array.isArray(report?.session) ? report.session : [];
  const sessions = new Map();
  for (const row of sessionRows) {
    if (!row || typeof row !== "object") continue;
    const source = text(row.agent, "unknown", 60).toLowerCase();
    const stableIdentity = text(row.period ?? row.sessionId ?? row.id, "", 1000);
    if (!stableIdentity) continue;
    const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
    const firstActivityAt = Date.parse(metadata.firstActivity ?? metadata.createdAt ?? "");
    const lastActivityAt = Date.parse(metadata.lastActivity ?? row.lastActivity ?? "");
    const sessionKey = sha256(`${deviceId}\u001f${source}\u001f${stableIdentity}`);
    sessions.set(`${source}\u001f${sessionKey}`, {
      source,
      sessionKey,
      ...(Number.isFinite(firstActivityAt) ? { firstActivityAt } : {}),
      ...(Number.isFinite(lastActivityAt) ? { lastActivityAt } : {}),
    });
  }
  return [...sessions.values()].sort((left, right) => `${left.source}/${left.sessionKey}`.localeCompare(`${right.source}/${right.sessionKey}`));
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
// Explicit UTC dates work with ccusage's combined daily/session sections.
export function reportDateArgs(config, { full = false, now = Date.now() } = {}) {
  const today = new Date(now).toISOString().slice(0, 10);
  const since = full || !config?.lastSyncAt ? "2024-01-01"
    : config.lastReconciledDay === today ? today
      : new Date(Date.parse(today + "T00:00:00Z") - 86_400_000).toISOString().slice(0, 10);
  return ["--since", since, "--until", today];
}
