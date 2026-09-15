// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { ActivityCalendar, ModelFlow, RhythmCharts, UsageTrend } from "./usage-charts";

describe("usage chart affordances", () => {
  test("empty time series exposes range controls and source data, not pretend usage", () => {
    const html = renderToStaticMarkup(<UsageTrend rows={[]} />);
    expect(html).toContain("No usage reported in this time range.");
    expect(html).toContain('aria-label="Usage time range"');
    expect(html).toContain('aria-label="Usage metric"');
    expect(html).toContain('aria-label="Chart source data"');
    expect(html).toContain("Not reported");
  });
  test("calendar has one keyboard entry point, exact labels, and missing-day state", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T12:00:00Z"));
    try {
      const html = renderToStaticMarkup(<ActivityCalendar rows={[{date:"2026-09-14",totalTokens:1234,costMicros:0,sessions:1}]} />);
      expect(html.match(/tabindex="0"/g)).toHaveLength(1);
      expect(html.match(/<button /g)).toHaveLength(365);
      expect(html).toContain('aria-label="2026-09-14: 1,234 tokens"');
      expect(html).toContain('aria-label="2026-09-15: not reported"');
      expect(html).toContain("1 active day.");
    } finally { vi.useRealTimers(); }
  });
  test("missing model and monthly data use explicit empty states", () => {
    expect(renderToStaticMarkup(<ModelFlow rows={[]} />)).toContain("hasn’t been reported");
    expect(renderToStaticMarkup(<RhythmCharts rows={[]} />)).toContain("No monthly cost reported.");
  });
});
