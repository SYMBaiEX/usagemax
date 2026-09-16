import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const repositoryRoot = process.cwd();

const obsoleteResearchPaths = [
  "security_best_practices_report.md",
  "docs/tokenmaxxing-gap-and-pricing-audit.md",
  "docs/research-and-roadmap.md",
  "docs/collector-coverage-audit.md",
] as const;

describe("documentation hygiene", () => {
  test("keeps obsolete research records out of the checkout", () => {
    for (const relativePath of obsoleteResearchPaths) {
      expect(existsSync(join(repositoryRoot, relativePath)), relativePath).toBe(false);
    }
  });

  test("does not link to obsolete research records", () => {
    const trackedText = ["README.md", "docs/README.md", "CONTRIBUTING.md"]
      .map((relativePath) => readFileSync(join(repositoryRoot, relativePath), "utf8"))
      .join("\n");

    for (const relativePath of obsoleteResearchPaths) {
      expect(trackedText).not.toContain(relativePath);
    }
  });
});
