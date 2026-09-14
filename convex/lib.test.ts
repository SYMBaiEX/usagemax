import { describe, expect, test } from "vitest";
import { isValidHistoricalDay, trailingDayCutoff } from "./lib";

describe("historical day validation", () => {
  const now = Date.UTC(2026, 8, 14, 12);

  test("accepts real in-range UTC days", () => {
    expect(isValidHistoricalDay("2026-09-14", now)).toBe(true);
    expect(isValidHistoricalDay("2024-01-01", now)).toBe(true);
  });

  test("rejects malformed, normalized, stale, and distant future days", () => {
    expect(isValidHistoricalDay("2026-02-31", now)).toBe(false);
    expect(isValidHistoricalDay("1970-01-01", now)).toBe(false);
    expect(isValidHistoricalDay("3089-08-23", now)).toBe(false);
    expect(isValidHistoricalDay("09/14/2026", now)).toBe(false);
  });

  test("uses inclusive seven and thirty day windows", () => {
    expect(trailingDayCutoff(now, 7)).toBe("2026-09-08");
    expect(trailingDayCutoff(now, 30)).toBe("2026-08-16");
  });
});
