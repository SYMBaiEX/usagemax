import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const repositoryRoot = process.cwd();

const obsoleteResearchPaths = [
  ["security", "best_practices_report.md"].join("_"),
  ["docs", ["tokenmaxxing", "gap", "and", "pricing-audit.md"].join("-")].join("/"),
  ["docs", ["research", "and", "roadmap.md"].join("-")].join("/"),
  ["docs", ["collector", "coverage", "audit.md"].join("-")].join("/"),
  ["docs", ["ora", "release-readiness.md"].join("-")].join("/"),
  ["docs", ["readiness", "remediation.md"].join("-")].join("/"),
  ["docs", ["enterprise", "delivery-plan.md"].join("-")].join("/"),
  ["docs", ["release", "2026-09-15.md"].join("-")].join("/"),
] as const;

describe("documentation hygiene", () => {
  test("keeps obsolete research records out of the checkout", () => {
    for (const relativePath of obsoleteResearchPaths) {
      expect(existsSync(join(repositoryRoot, relativePath)), relativePath).toBe(false);
    }
  });

  test("does not link to obsolete research records", () => {
    const trackedText = ["README.md", "docs/README.md", "CONTRIBUTING.md", "docs/enterprise-readiness.md"]
      .map((relativePath) => readFileSync(join(repositoryRoot, relativePath), "utf8"))
      .join("\n");

    for (const relativePath of obsoleteResearchPaths) {
      expect(trackedText).not.toContain(relativePath);
    }
  });

  test("does not retain a dated release-notes directory", () => {
    expect(existsSync(join(repositoryRoot, "docs/releases"))).toBe(false);
  });
});
