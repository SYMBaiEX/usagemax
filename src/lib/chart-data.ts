export type UsageDay = { date: string; totalTokens: number; costMicros: number; sessions: number; costBasis?: string };
export type ModelDay = { date: string; provider: string; model: string; totalTokens: number; costMicros: number };
export const chartPalette = ["#ca512b", "#397d86", "#79669b", "#9d7c2e"];
export const otherColor = "#a6a599";

export function modelColor(identity: string) {
  let hash = 0;
  for (const character of identity) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return chartPalette[hash % chartPalette.length];
}

// Resolve palette collisions for the four focal series. Sorting identities makes
// the assignment independent of input order; all remaining series use Other.
export function modelColors(identities: string[]) {
  const colors = new Map<string, string>();
  const used = new Set<string>();
  [...new Set(identities)].sort().forEach(id => {
    const preferred = modelColor(id);
    const color = !used.has(preferred) ? preferred : chartPalette.find(value => !used.has(value)) ?? otherColor;
    used.add(color);
    colors.set(id, color);
  });
  return colors;
}

export function calendarWindow<T extends { date: string }>(rows: T[], count: number, endTime = Date.now()) {
  const byDate = new Map(rows.map(row => [row.date, row]));
  const end = new Date(endTime);
  end.setUTCHours(0, 0, 0, 0);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - count + index + 1);
    const key = date.toISOString().slice(0, 10);
    return { date: key, row: byDate.get(key) };
  });
}

export function usageSeries(rows: UsageDay[], count: number, endTime = Date.now()) {
  return calendarWindow(rows, count, endTime).map(({ date, row }) => ({
    date, tokens: row?.totalTokens ?? null, cost: row && row.costBasis !== "unknown" ? row.costMicros / 1_000_000 : null,
    sessions: row?.sessions ?? null, basis: row ? row.costBasis ?? "unspecified" : "not reported",
  }));
}

export function modelSeries(rows: ModelDay[], count: number, endTime = Date.now()) {
  const window = calendarWindow([], count, endTime);
  const validDates = new Set(window.map(day => day.date));
  const selected = rows.filter(row => validDates.has(row.date));
  const totals = new Map<string, number>();
  selected.forEach(row => { const id = `${row.provider}\u001f${row.model}`; totals.set(id, (totals.get(id) ?? 0) + row.totalTokens); });
  const keys = [...totals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 4).map(([id]) => id);
  const colors = modelColors(keys);
  const models = keys.map((id, index) => ({ id, key: `model${index}`, name: id.split("\u001f")[1], provider: id.split("\u001f")[0], color: colors.get(id)! }));
  const byDate = new Map<string, ModelDay[]>();
  selected.forEach(row => byDate.set(row.date, [...(byDate.get(row.date) ?? []), row]));
  const data = window.map(({ date }) => {
    const days = byDate.get(date);
    const result: Record<string, string | number | null> = { date, total: days ? 0 : null, other: days ? 0 : null };
    models.forEach(model => { result[model.key] = days ? 0 : null; });
    days?.forEach(day => {
      const model = models.find(model => model.id === `${day.provider}\u001f${day.model}`);
      const key = model?.key ?? "other";
      result[key] = Number(result[key]) + day.totalTokens;
      result.total = Number(result.total) + day.totalTokens;
    });
    return result;
  });
  return { data, models, hasOther: data.some(day => Number(day.other) > 0) };
}

export function monthlySeries(rows: UsageDay[]) {
  const totals = new Map<string, number>();
  rows.filter(row => row.costBasis !== "unknown").forEach(row => totals.set(row.date.slice(0, 7), (totals.get(row.date.slice(0, 7)) ?? 0) + row.costMicros / 1_000_000));
  return [...totals].sort((a, b) => a[0].localeCompare(b[0])).slice(-6).map(([month, cost]) => ({ month, cost }));
}
