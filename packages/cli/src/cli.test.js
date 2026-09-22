import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const cli = fileURLToPath(new URL("./cli.js", import.meta.url));

test("command help exits before sync, credential, or network work", async () => {
  for (const [args, expected] of [
    [["link", "--help"], "Usage: usagemax link"],
    [["sync", "--help"], "Usage: usagemax sync"],
    [["status", "--help"], "Usage: usagemax status"],
    [["doctor", "--help"], "Usage: usagemax doctor"],
    [["unlink", "--help"], "Usage: usagemax unlink"],
    [["telemetry", "test", "--help"], "Usage: usagemax telemetry test"],
    [["service", "install", "--help"], "Usage: usagemax service install"],
    [["update", "--help"], "Usage: usagemax update"],
  ]) {
    const { stdout } = await exec(process.execPath, [cli, ...args], {
      env: { ...process.env, USAGEMAX_CONFIG_DIR: "/path/that/does/not/exist" },
    });
    assert.match(stdout, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("JSON doctor output is stable and never echoes environment credentials", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "usagemax-cli-doctor-"));
  const marker = "umx_test_do_not_echo_credential";
  try {
    const { stdout } = await exec(process.execPath, [cli, "doctor", "--json", "--quiet"], {
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        USAGEMAX_CONFIG_DIR: path.join(home, ".config", "usagemax"),
        USAGEMAX_DISABLE_UPDATE_CHECK: "1",
        USAGEMAX_TOKEN: marker,
      },
    });
    const report = JSON.parse(stdout);
    assert.equal(typeof report.cliVersion, "string");
    assert.ok(Array.isArray(report.supportedSources));
    assert.equal(report.windowsHomeDiscovery.status, "not-applicable");
    assert.equal(stdout.includes(marker), false);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("unknown documented command flags fail before work starts", async () => {
  for (const [command, flag, diagnostic] of [
    ["sync", "--definitely-not-a-sync-option", "Unknown option for sync"],
    ["status", "--definitely-not-a-status-option", "Unknown option for status"],
  ]) {
    await assert.rejects(
      exec(process.execPath, [cli, command, flag], {
        env: { ...process.env, USAGEMAX_CONFIG_DIR: "/path/that/does/not/exist", USAGEMAX_DISABLE_UPDATE_CHECK: "1" },
      }),
      (error) => error.code === 1 && error.stderr.includes(diagnostic),
    );
  }
});
