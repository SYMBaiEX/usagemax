// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchQuery = vi.hoisted(() => vi.fn());
vi.mock("convex/nextjs", () => ({ fetchQuery }));

import { GET, HEAD } from "./route";

beforeEach(() => fetchQuery.mockReset());

describe("public profile markdown route", () => {
  it("renders a heading-led, frontmatter-backed profile", async () => {
    fetchQuery.mockResolvedValue({
      profile: { handle: "Builder", displayName: "A Builder", isVerified: true },
      stats: { totalTokens: 1234, totalCostMicros: 4560000, activeDays: 3, sessions: 4, deviceCount: 2, currentStreakDays: 2, firstDay: "2026-09-01", lastDay: "2026-09-03", topModel: "model-x", costBasis: "reported" },
      models: [{ provider: "openai", model: "model-x", totalTokens: 1234, costMicros: 4560000 }],
    });

    const response = await GET(new Request("https://test/profile.md?handle=Builder"));
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/markdown");
    expect(body.startsWith("---\n")).toBe(true);
    expect(body).toContain("# @builder · UsageMax profile");
    expect(body).toContain("| 1 | openai | model-x | 1,234 | $4.56 |");
    expect(fetchQuery).toHaveBeenCalledWith(expect.anything(), { handle: "builder" });
  });

  it("returns an agent-readable 404 for private or missing profiles", async () => {
    fetchQuery.mockResolvedValue(null);
    const response = await GET(new Request("https://test/profile.md?handle=missing"));
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("text/markdown");
    expect(await response.text()).toContain("# UsageMax profile not found");
  });

  it("supports a bodyless HEAD response", async () => {
    const response = await HEAD(new Request("https://test/profile.md?handle=builder"));
    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
    expect(response.headers.get("link")).toContain("/builder");
  });
});
