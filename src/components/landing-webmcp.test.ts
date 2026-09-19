import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("landing declarative WebMCP surface", () => {
  it("publishes bounded forms for every browser-safe landing action", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/landing-page.tsx"), "utf8");
    expect(source).toContain('toolname: "usagemax_network_stats"');
    expect(source).toContain('toolname: "usagemax_leaderboard"');
    expect(source).toContain('toolname: "usagemax_ask"');
    expect(source).toContain('toolname: "usagemax_sandbox_validate"');
    expect(source).toContain('tooldescription: "Read bounded public UsageMax network statistics."');
    expect(source).toContain('name="query"');
    expect(source).toContain('action="/ask" method="get"');
  });
});
