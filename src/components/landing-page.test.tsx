// @vitest-environment node
import type { AnchorHTMLAttributes } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { LandingPage } from "./landing-page";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
vi.mock("convex/react", () => ({ useQuery: queryMock }));
vi.mock("next/link", () => ({
  default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
}));

const network = { totalTokens: 123_450_000, totalCostMicros: 1_250_000_000, totalSessions: 765, profiles: 1, activeAgents: 0, eventsToday: 0, updatedAt: 1 };
const profile = { metric: "tokens", period: "all", score: 123_450_000, handle: "test-builder", displayName: "Test Builder", verification: "collector", totalTokens: 123_450_000, totalCostMicros: 1_250_000_000, sessions: 765 };

describe("landing page", () => {
  beforeEach(() => {
    queryMock.mockReset();
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://example.convex.cloud");
  });
  afterEach(() => vi.unstubAllEnvs());

  function render(rows: unknown = [profile], totals: unknown = network) {
    queryMock.mockImplementation((_query, args) => "period" in args ? rows : totals);
    return renderToStaticMarkup(<LandingPage />);
  }

  test("renders first-party totals and a single profile without duplicate showcases", () => {
    const html = render();
    expect(html).toContain("123.45M");
    expect(html).toContain("$1,250");
    expect(html.match(/href="\/test-builder"/g)).toHaveLength(1);
    expect(html).toContain("Not an invoice.");
    expect(queryMock).toHaveBeenCalledTimes(2);
    expect(queryMock.mock.calls[1][1]).toEqual({ period: "all", metric: "tokens", limit: 5 });
  });

  test("does not invent data while the subscriptions load", () => {
    queryMock.mockReturnValue(undefined);
    const html = renderToStaticMarkup(<LandingPage />);
    expect(html).toContain("Connecting to network");
    expect(html).toContain("Loading the public ledger");
    expect(html).not.toContain("123.45M");
    expect(html).toContain('aria-busy="true"');
  });

  test("keeps an empty public ledger useful and does not imply private profiles are public", () => {
    const html = render([], { ...network, totalTokens: 0, profiles: 0 });
    expect(html).toContain("No public profiles in this period yet.");
    expect(html).toContain("Only profiles that choose to be public.");
    expect(html).toContain("Make your mark");
    expect(html).not.toContain("test-builder");
  });

  test("renders five distinct profiles with escaped names and verified-account labels", () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ ...profile, handle: `builder-${i}`, displayName: `<Builder ${i}> with a very long display name`, verification: i === 0 ? "verified" : "collector" }));
    const html = render(rows);
    expect(html.match(/href="\/builder-\d"/g)).toHaveLength(5);
    expect(html).toContain("&lt;Builder 0&gt;");
    expect(html).toContain('aria-label="Verified account"');
    expect(html).not.toContain("<Builder 0>");
  });

  test("preserves document auth navigation and a usable page without Convex configuration", () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "");
    const html = renderToStaticMarkup(<LandingPage />);
    expect(queryMock).not.toHaveBeenCalled();
    expect(html).toContain('href="/sign-up"');
    expect(html).toContain("Network unavailable");
    expect(html).toContain("Public rankings are temporarily unavailable.");
    expect(html).toContain("bunx usagemax");
    expect(html).toContain('href="/enterprise"');
  });
});
