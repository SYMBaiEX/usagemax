// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { TokenInstrument } from "./token-instrument";

describe("UsageMax physical counter", () => {
  test.each([100_000_000_000, 123_450_000_000, 999_990_000_000, 1_000_000_000_000, 999_990_000_000_000])("retains every reel for triple-digit and trillion totals: %s", (totalTokens) => {
    const formatted = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(totalTokens);
    const html = renderToStaticMarkup(<TokenInstrument totals={{ totalTokens, totalSessions: 123_450, totalCostMicros: 999_990_000_000 }} />);
    expect(html).toContain(`aria-label="Tokens: ${formatted}"`);
    expect(html.match(/<b>/g)).toHaveLength(formatted.length);
  });
  test("shows an unknown counter until real totals arrive", () => {
    const html = renderToStaticMarkup(<TokenInstrument />);
    expect(html).toContain('aria-label="Tokens: —"');
    expect(html).toContain('data-ready="false"');
    expect(html).not.toContain('aria-label="Tokens: 0"');
  });

  test("renders supplied data with one selected, accessible metric control", () => {
    const html = renderToStaticMarkup(<TokenInstrument totals={{ totalTokens: 96_280_000_000, totalSessions: 4_160, totalCostMicros: 73_046_000_000 }} />);
    expect(html).toContain('aria-label="Tokens: 96.28B"');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/type="button"/g)).toHaveLength(3);
    expect(html).toContain('aria-label="Network counter metric"');
    expect(html).toContain('aria-atomic="true"');
    expect(html).not.toContain("<canvas");
    expect(html).not.toContain("<video");
  });

  test("distinguishes a reported zero from an unavailable total", () => {
    const html = renderToStaticMarkup(<TokenInstrument totals={{ totalTokens: 0, totalSessions: 0, totalCostMicros: 0 }} />);
    expect(html).toContain('aria-label="Tokens: 0"');
    expect(html).toContain('data-ready="true"');
  });
});
