// @vitest-environment node
import { describe, expect, test } from "vitest";
import { calendarWindow, modelColors, modelSeries, monthlySeries, usageSeries, type UsageDay } from "./chart-data";

const end = Date.parse("2026-09-15T23:59:00-05:00"); // September 16 in UTC
const day = (date: string, totalTokens = 12, costMicros = 1_500_000, costBasis = "reported"): UsageDay => ({ date, totalTokens, costMicros, costBasis, sessions: 1 });

describe("chart data semantics", () => {
  test("calendar windows use UTC, include today, and exclude old/future reports", () => {
    const window = calendarWindow([day("2026-09-13"), day("2026-09-15"), day("2026-09-17")], 3, end);
    expect(window.map(row => row.date)).toEqual(["2026-09-14", "2026-09-15", "2026-09-16"]);
    expect(window.map(row => row.row?.totalTokens)).toEqual([undefined, 12, undefined]);
  });
  test("zero is a measurement; a missing report is a gap", () => {
    const series = usageSeries([day("2026-09-15", 0, 0)], 2, end);
    expect(series[0]).toMatchObject({ tokens: 0, cost: 0, sessions: 1 });
    expect(series[1]).toMatchObject({ tokens: null, cost: null, sessions: null });
  });
  test("microdollars convert once and unknown costs do not become zero", () => {
    expect(usageSeries([day("2026-09-16")], 1, end)[0].cost).toBe(1.5);
    expect(usageSeries([day("2026-09-16", 100, 0, "unknown")], 1, end)[0]).toMatchObject({ tokens: 100, cost: null });
  });
  test("model stack reconciles top four and Other without dropping volume", () => {
    const rows = Array.from({ length: 7 }, (_, index) => ({ date: "2026-09-15", provider: "test", model: `model-${index}`, totalTokens: index + 1, costMicros: 0 }));
    const result = modelSeries(rows, 2, end);
    expect(result.models).toHaveLength(4);
    expect(result.hasOther).toBe(true);
    expect(result.data[0].total).toBe(28);
    expect(result.data[0].other).toBe(6);
    expect(result.models.reduce((sum, model) => sum + Number(result.data[0][model.key]), Number(result.data[0].other))).toBe(28);
    expect(result.data[1].total).toBeNull();
    expect(result.data[1].model0).toBeNull();
    expect(new Set(result.models.map(model => model.color)).size).toBe(4);
  });
  test("color assignments are deterministic and distinguish providers", () => {
    const ids = ["p1\u001fsame", "p2\u001fsame", "p1\u001fa", "p1\u001fb"];
    expect(modelColors(ids)).toEqual(modelColors([...ids].reverse()));
    expect(new Set(modelColors(ids).values()).size).toBe(4);
  });
  test("duplicate model rows aggregate and older model history is excluded", () => {
    const row = { date: "2026-09-16", provider: "test", model: "one", totalTokens: 10, costMicros: 0 };
    const result = modelSeries([row, row, { ...row, date: "2025-09-16", totalTokens: 1000 }], 1, end);
    expect(result.data[0]).toMatchObject({ total: 20, model0: 20, other: 0 });
  });
  test("monthly aggregation separates years and preserves sub-dollar values", () => {
    expect(monthlySeries([day("2025-09-01", 1, 100_000), day("2026-09-01", 1, 200_000), day("2026-09-02", 1, 300_000), day("2026-10-01", 1, 0, "unknown")])).toEqual([{ month: "2025-09", cost: .1 }, { month: "2026-09", cost: .5 }]);
  });
  test("empty datasets stay explicitly empty", () => {
    expect(usageSeries([], 2, end).every(row => row.tokens === null)).toBe(true);
    expect(modelSeries([], 2, end).models).toEqual([]);
    expect(monthlySeries([])).toEqual([]);
  });
});
