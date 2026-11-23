export type CatalogProvider = "openai" | "anthropic";

type CacheTtl = "5m" | "1h" | "30m" | "12h";
export type ObservedRate = {
  input: number;
  output: number;
  cacheRead: number | null;
  cacheWrite?: Partial<Record<CacheTtl, number>>;
};
export type ObservedModelRate = {
  model: string;
  standard: ObservedRate;
  context?: { shortMax: number; long: ObservedRate | null };
  through?: string;
};

export const officialPricingSources: Record<CatalogProvider, { markdownUrl: string; pricingSource: string }> = {
  openai: {
    markdownUrl: "https://developers.openai.com/api/docs/pricing.md",
    pricingSource: "https://developers.openai.com/api/docs/pricing",
  },
  anthropic: {
    markdownUrl: "https://platform.claude.com/docs/en/about-claude/pricing.md",
    pricingSource: "https://platform.claude.com/docs/en/about-claude/pricing",
  },
};

const openAiContextHeader = [
  "Model", "Short context input", "Short context output", "Short context cached input",
  "Short context 30m write", "Short context 12h write", "Long context input", "Long context output",
  "Long context cached input", "Long context 30m write", "Long context 12h write",
];
const openAiFlatHeader = ["Model", "Input", "Output", "Cached input"];
const openAiSpecializedHeader = ["Category", ...openAiFlatHeader, "30m write", "12h write"];
const anthropicHeader = ["Model", "Base input tokens", "5m cache writes", "1h cache writes", "Cache hits and refreshes", "Output tokens"];

// Pre-4.6 display names cannot be translated to their pinned API IDs mechanically.
// https://platform.claude.com/docs/en/about-claude/model-deprecations
const datedClaudeModels: Record<string, { model: string; through?: string }> = {
  "Claude Opus 4.5": { model: "claude-opus-4-5-20251101" },
  "Claude Sonnet 4.5": { model: "claude-sonnet-4-5-20250929", through: "2026-11-29" },
  "Claude Haiku 4.5": { model: "claude-haiku-4-5-20251001" },
};

type Table = { header: string[]; rows: string[][] };

function invalid(reason: string): never {
  throw new Error("INVALID_OFFICIAL_PRICE_CATALOG: " + reason);
}

function section(markdown: string, startHeading: string, endHeading: string): string[] {
  const lines = markdown.split(/\r?\n/).map((line) => line.trim());
  const start = lines.indexOf(startHeading);
  const end = lines.indexOf(endHeading, start + 1);
  if (start < 0 || end < 0 || lines.lastIndexOf(startHeading) !== start) invalid("incomplete pricing section");
  return lines.slice(start + 1, end);
}

function tables(lines: string[]): Table[] {
  const blocks: string[][] = [];
  let block: string[] | undefined;
  for (const line of lines) {
    if (!line.startsWith("|")) {
      block = undefined;
      continue;
    }
    if (!line.endsWith("|")) invalid("incomplete table line");
    if (!block) {
      block = [];
      blocks.push(block);
    }
    block.push(line);
  }
  return blocks.map((lines) => {
    const [header, divider, ...rows] = lines.map((line) => line.slice(1, -1).split("|").map((cell) => cell.trim()));
    if (!header?.length || !divider || divider.length !== header.length || !divider.every((cell) => /^:?-{3,}:?$/.test(cell))
      || !rows.length || rows.length > 128 || rows.some((row) => row.length !== header.length || row.includes(""))) {
      invalid("malformed pricing table");
    }
    return { header, rows };
  });
}

function headerIs(table: Table, expected: string[]) {
  return table.header.length === expected.length && expected.every((name, idx) => table.header[idx] === name);
}

function dollar(cell: string, anthropic = false): number {
  const normalized = anthropic ? cell.replace(/ \/ MTok(?:<sup>\d+<\/sup>)?$/, "") : cell;
  if ((anthropic && normalized === cell) || !/^\$(?:0|[1-9]\d{0,3})(?:\.\d{1,4})?$/.test(normalized)) {
    invalid("invalid USD price per million tokens");
  }
  return Number(normalized.slice(1));
}

function openAiOptionalDollar(cell: string): number | null {
  return cell === "-" || cell === "—" ? null : dollar(cell);
}

function openAiRates(cells: string[]): ObservedRate {
  const [input, output, cacheRead, shortWrite, longWrite] = cells;
  const write30m = shortWrite === undefined ? null : openAiOptionalDollar(shortWrite);
  const write12h = longWrite === undefined ? null : openAiOptionalDollar(longWrite);
  return {
    input: dollar(input),
    output: dollar(output),
    cacheRead: openAiOptionalDollar(cacheRead),
    ...(write30m !== null || write12h !== null ? {
      cacheWrite: {
        ...(write30m !== null ? { "30m": write30m } : {}),
        ...(write12h !== null ? { "12h": write12h } : {}),
      },
    } : {}),
  };
}

function promptLimit(value: string): number {
  if (!/^(?:[1-9]\d{0,8}|[1-9]\d{0,2}(?:,\d{3}){1,2})$/.test(value)) invalid("invalid context limit");
  return Number(value.replaceAll(",", ""));
}

function dayBefore(description: string): string {
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const date = /^([A-Za-z]+) (\d{1,2}), (20\d{2})$/.exec(description);
  if (!date) invalid("invalid promotion deadline");
  const month = months.indexOf(date[1]);
  if (month === -1) invalid("invalid promotion month");
  const timestamp = Date.UTC(Number(date[3]), month, Number(date[2]));
  if (new Date(timestamp).getUTCDate() !== Number(date[2])) invalid("invalid promotion day");
  // Without an effective time, every quoted UTC day must be fully in the window.
  return new Date(timestamp - 86_400_000).toISOString().slice(0, 10);
}

function openAiPromotionCaps(markdown: string): Map<string, string> {
  const caps = new Map<string, string>();
  const notices = markdown.matchAll(/\b(GPT[-‑]\d+(?:\.\d+)*(?: [A-Za-z0-9-]+)?)['’]s promotional pricing is available (?:until|through) ([^\n.]+)\./g);
  for (const [, display, date] of notices) {
    const model = display.toLowerCase().replaceAll("‑", "-").replaceAll(" ", "-");
    const through = dayBefore(date);
    if (caps.has(model) && caps.get(model) !== through) invalid("conflicting promotion deadlines");
    caps.set(model, through);
  }
  const grouped = /^((?:GPT[-‑]).+?) promotional pricing is available at least through ([A-Za-z]+ \d{1,2}, 20\d{2})\./m.exec(markdown);
  if (grouped) {
    for (const display of grouped[1].split(/,\s*(?:and\s+)?|\s+and\s+/)) {
      const model = display.toLowerCase().replaceAll("‑", "-").replaceAll(" for ", " ").replaceAll(" ", "-");
      if (!/^gpt-\d[a-z0-9.-]+$/.test(model)) invalid("unrecognized promotional model");
      const through = dayBefore(grouped[2]);
      if (caps.has(model) && caps.get(model) !== through) invalid("conflicting promotion deadlines");
      caps.set(model, through);
    }
  }
  return caps;
}

function openAiSpecialized(markdown: string, shortMax: number, caps: ReadonlyMap<string, string>): ObservedModelRate[] {
  if (!/^Specialized models\s*$/m.test(markdown)) return [];
  const [table, ...extra] = tables(section(markdown, "Specialized models", "Fast"));
  if (!table || extra.length || !headerIs(table, openAiSpecializedHeader)) invalid("unexpected OpenAI specialized Standard table");

  const groups = new Map<string, { standard?: ObservedRate; long?: ObservedRate | null; tiered: boolean }>();
  for (const [, label, ...cells] of table.rows) {
    if (!/^(?:gpt-|chat-latest$)/.test(label)) continue;
    const match = /^((?:gpt-[a-z0-9.-]+|chat-latest))(?: \((short|long) context\))?$/.exec(label);
    if (!match) invalid("unrecognized OpenAI specialized model");
    const [, model, tier] = match;
    const tiered = tier !== undefined;
    const group = groups.get(model) ?? { tiered };
    if (group.tiered !== tiered) invalid("conflicting OpenAI specialized tiers");
    if (tier === "long") {
      if (group.long !== undefined) invalid("duplicate OpenAI specialized rate");
      group.long = cells.every((cell) => cell === "-" || cell === "—") ? null : openAiRates(cells);
    } else {
      if (group.standard) invalid("duplicate OpenAI specialized rate");
      group.standard = openAiRates(cells);
    }
    groups.set(model, group);
  }
  return [...groups].map(([model, { standard, long, tiered }]) => {
    if (!standard || (tiered && long === undefined)) invalid("incomplete OpenAI specialized tiers");
    // Keep the known promotional amounts bounded if the notice disappears
    // before a new Standard rate is published.
    const currentPromotion = (model === "gpt-6.2-astra-law" && standard.input === 8 && standard.output === 40 && standard.cacheRead === 0.4)
      || ((model === "gpt-6-astra-law" || model === "gpt-6-rosalind")
        && standard.input === 10 && standard.output === 50 && standard.cacheRead === 1);
    const through = caps.get(model) ?? (currentPromotion ? "2026-12-30" : undefined);
    return { model, standard, ...(long === undefined ? {} : { context: { shortMax, long } }), ...(through ? { through } : {}) };
  });
}

function parseOpenAi(markdown: string): ObservedModelRate[] {
  if (!/^\s*Prices per 1M tokens\.\s*$/m.test(markdown)) invalid("missing OpenAI price units");
  const limits = [...markdown.matchAll(/^Short context: ≤([\d,]+)(K?) input tokens\. Long context: >\1\2 input tokens\.\s*$/gm)];
  if (limits.length !== 1) invalid("missing or ambiguous OpenAI context threshold");
  const shortMax = promptLimit(limits[0][1]) * (limits[0][2] === "K" ? 1_000 : 1);
  if (!Number.isSafeInteger(shortMax) || shortMax > 100_000_000) invalid("invalid OpenAI context limit");

  const [context, flat, ...extra] = tables(section(markdown, "### Standard pricing data", "### Batch pricing data"));
  if (!context || !flat || extra.length || !headerIs(context, openAiContextHeader) || !headerIs(flat, openAiFlatHeader)) {
    invalid("unexpected OpenAI Standard tables");
  }
  const caps = openAiPromotionCaps(markdown);
  const result = new Map<string, ObservedModelRate>();
  for (const [rows, tiered] of [[context.rows, true], [flat.rows, false]] as const) {
    for (const [label, ...cells] of rows) {
      if (!/^(?:gpt-|o\d)/.test(label)) continue;
      const match = /^((?:gpt-\d|o\d)[a-z0-9.-]{0,93})(?: \(<(\d+)K context length\))?$/.exec(label);
      if (!match || (match[2] !== undefined && (!tiered || Number(match[2]) * 1_000 !== shortMax))) {
        invalid("unrecognized OpenAI model price label");
      }
      const model = match[1];
      if (result.has(model)) invalid("duplicate OpenAI model");
      const standard = openAiRates(cells.slice(0, 5));
      // Do not extend the displayed promotional price if its note disappears
      // before OpenAI publishes the replacement Standard rate.
      const knownSolPromotion = model === "gpt-5.6-sol" && standard.input === 4
        && standard.output === 20 && standard.cacheRead === 0.4;
      const through = caps.get(model) ?? (knownSolPromotion ? "2026-11-29" : undefined);
      result.set(model, {
        model,
        standard,
        ...(tiered ? { context: { shortMax, long: openAiRates(cells.slice(5)) } } : {}),
        ...(through ? { through } : {}),
      });
    }
  }
  for (const model of openAiSpecialized(markdown, shortMax, caps)) {
    if (result.has(model.model)) invalid("duplicate OpenAI model");
    result.set(model.model, model);
  }
  return [...result.values()];
}

type ClaudeRateGroup = {
  standard?: ObservedRate;
  long?: ObservedRate;
  shortMax?: number;
  through?: string;
};

function parseAnthropic(markdown: string): ObservedModelRate[] {
  if (!markdown.includes("All prices are in USD.")) invalid("missing Anthropic price currency");
  const [pricing, ...extra] = tables(section(markdown, "## Model pricing", "## Cloud platform pricing"));
  if (!pricing || extra.length || !headerIs(pricing, anthropicHeader)) invalid("unexpected Anthropic Model pricing table");
  const result = new Map<string, ClaudeRateGroup>();
  for (const [label, input, write5m, write1h, cacheRead, output] of pricing.rows) {
    if (/ \(\[retired(?:,[^\]]+)?\]\(https:\/\/[^\s)]+\)\)$/.test(label)) continue;

    const identity = /^(Claude ([A-Za-z]+) ([1-9]\d?)(?:\.(\d{1,2}))?)(.*)$/.exec(label);
    if (!identity) invalid("unrecognized Anthropic model price label");
    const [, display, line, major, minor, suffix] = identity;
    const lateGeneration = Number(major) > 4 || (major === "4" && Number(minor) >= 6);
    const dated = datedClaudeModels[display];
    if (!lateGeneration && !dated) continue;
    const model = dated?.model ?? ["claude", line.toLowerCase(), major, ...(minor ? [minor] : [])].join("-");
    const extent = /^ \(for prompts (up to|over) ([\d,]+) tokens\)$/.exec(suffix);
    const limited = /^ \(\[limited availability\]\(https:\/\/[^\s)]+\)\)$/.test(suffix);
    if (suffix && !extent && !limited) invalid("unrecognized Anthropic model variant");

    const group = result.get(model) ?? (dated?.through ? { through: dated.through } : {});
    const tier = extent?.[1] === "over" ? "long" : "standard";
    const shortMax = extent ? promptLimit(extent[2]) : undefined;
    if (group[tier] || (result.has(model) && group.shortMax !== shortMax)) {
      invalid("duplicate Anthropic model or conflicting prompt tiers");
    }
    group.shortMax = shortMax;
    group[tier] = {
      input: dollar(input, true),
      output: dollar(output, true),
      cacheRead: dollar(cacheRead, true),
      cacheWrite: { "5m": dollar(write5m, true), "1h": dollar(write1h, true) },
    };
    result.set(model, group);
  }
  return [...result].map(([model, { standard, long, shortMax, through }]) => {
    if (!standard || (shortMax !== undefined && !long)) invalid("incomplete Anthropic prompt tiers");
    return {
      model, standard,
      ...(long && shortMax !== undefined ? { context: { shortMax, long } } : {}),
      ...(through ? { through } : {}),
    };
  });
}

export function parseOfficialRateCatalog(provider: CatalogProvider, markdown: string): ObservedModelRate[] {
  if (!markdown.trim() || markdown.length > 256_000) invalid("missing or oversized Markdown");
  const models = provider === "openai" ? parseOpenAi(markdown) : parseAnthropic(markdown);
  if (!models.length) invalid("empty supported catalog");
  return models.sort((a, b) => a.model === b.model ? 0 : a.model < b.model ? -1 : 1);
}
