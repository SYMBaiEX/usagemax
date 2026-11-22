import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import test from "node:test";
import { ccusageDailyArgs } from "./ccusage.js";
import { reportDateArgs } from "./core.js";
import { ccusageEnvironment } from "./sources.js";
const require = createRequire(import.meta.url);
test("incremental date bounds reconcile UTC rollover without incompatible --last", () => {
  const now = Date.parse("2026-01-01T00:01:00Z");
  assert.deepEqual(reportDateArgs({ lastSyncAt: 1, lastReconciledDay: "2025-12-31" }, { now }), ["--since", "2025-12-31", "--until", "2026-01-01"]);
  assert.deepEqual(reportDateArgs({ lastSyncAt: 1, lastReconciledDay: "2026-01-01" }, { now }), ["--since", "2026-01-01", "--until", "2026-01-01"]);
  assert.equal(reportDateArgs({}, { now, full: true })[1], "2024-01-01");
});

test("the parser loads Codex history on a computer without Claude Code", async () => {
  const entry = join(dirname(require.resolve("ccusage/package.json")), "src/cli.js");
  const home = await mkdtemp(join(tmpdir(), "usagemax-codex-only-"));
  const codexHome = join(home, ".codex");
  const sessions = join(codexHome, "sessions", "2026", "11", "21");
  try {
    await mkdir(sessions, { recursive: true });
    const model = "gpt-6.2-sol";
    const timestamp = "2026-11-21T12:00:00.000Z";
    const tokens = { input_tokens: 1000, cached_input_tokens: 250, output_tokens: 125, reasoning_output_tokens: 75, total_tokens: 1125 };
    const records = [
      { timestamp, type: "turn_context", payload: { model } },
      { timestamp, type: "event_msg", payload: { type: "token_count", info: { model, last_token_usage: tokens, total_token_usage: tokens } } },
    ];
    await writeFile(join(sessions, "rollout-test.jsonl"), records.map((row) => JSON.stringify(row)).join("\n"));
    const env = await ccusageEnvironment({ env: { HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, "config"), CODEX_HOME: codexHome } });
    assert.equal(env.CLAUDE_CONFIG_DIR, undefined);
    const { stdout } = await promisify(execFile)(process.execPath, [entry, ...ccusageDailyArgs({}, { full: true, offlinePricing: true })], {
      env: { ...process.env, ...env, CLAUDE_CONFIG_DIR: undefined },
      cwd: home,
      timeout: 30_000,
    });
    const rows = JSON.parse(stdout).daily.flatMap((day) => day.agents).flatMap((agent) => agent.modelBreakdowns);
    assert.ok(rows.some((row) => row.modelName === model && row.inputTokens > 0));
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
test("installed ccusage accepts production combined-section incremental arguments", async () => {
  const entry = join(dirname(require.resolve("ccusage/package.json")), "src/cli.js");
  // Future bounds exercise the real native parser without returning personal history.
  // Use an empty home so this contract test does not scan the developer's local
  // provider histories (which can make a parser-only check take minutes).
  const home = await mkdtemp(join(tmpdir(), "usagemax-ccusage-contract-"));
  const args = ccusageDailyArgs({ lastSyncAt: 1 }, { now: Date.parse("2099-01-02T00:00:00Z"), offlinePricing: true });
  assert.ok(ccusageDailyArgs({}).includes("--no-offline"));
  assert.ok(args.includes("--offline"));
  assert.ok(args.includes("--breakdown"), "model-level detail must be explicitly requested from ccusage");
  try {
    const { stdout } = await promisify(execFile)(process.execPath, [entry, ...args], {
      env: { ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, "config"), CODEX_HOME: join(home, ".codex") },
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });
    assert.equal(typeof JSON.parse(stdout), "object");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
