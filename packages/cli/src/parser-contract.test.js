import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import test from "node:test";
import { reportDateArgs } from "./core.js";
const require = createRequire(import.meta.url);
test("incremental date bounds reconcile UTC rollover without incompatible --last", () => {
  const now = Date.parse("2026-01-01T00:01:00Z");
  assert.deepEqual(reportDateArgs({ lastSyncAt: 1, lastReconciledDay: "2025-12-31" }, { now }), ["--since", "2025-12-31", "--until", "2026-01-01"]);
  assert.deepEqual(reportDateArgs({ lastSyncAt: 1, lastReconciledDay: "2026-01-01" }, { now }), ["--since", "2026-01-01", "--until", "2026-01-01"]);
  assert.equal(reportDateArgs({}, { now, full: true })[1], "2024-01-01");
});
test("installed ccusage accepts production combined-section incremental arguments", async () => {
  const entry = join(dirname(require.resolve("ccusage/package.json")), "src/cli.js");
  // Future bounds exercise the real native parser without returning personal history.
  // Use an empty home so this contract test does not scan the developer's local
  // provider histories (which can make a parser-only check take minutes).
  const home = await mkdtemp(join(tmpdir(), "usagemax-ccusage-contract-"));
  const bounds = reportDateArgs({ lastSyncAt: 1 }, { now: Date.parse("2099-01-02T00:00:00Z") });
  try {
    const { stdout } = await promisify(execFile)(process.execPath, [entry, "daily", "--json", "--offline", "--mode", "calculate", "--timezone", "UTC", "--by-agent", "--order", "asc", "--sections", "daily,session", ...bounds], {
      env: { ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, "config"), CODEX_HOME: join(home, ".codex") },
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });
    assert.equal(typeof JSON.parse(stdout), "object");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
