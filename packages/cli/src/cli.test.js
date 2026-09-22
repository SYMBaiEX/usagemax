import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const cli = fileURLToPath(new URL("./cli.js", import.meta.url));

test("command help exits before sync, credential, or network work", async () => {
  for (const [args, expected] of [
    [["sync", "--help"], "Usage: usagemax sync"],
    [["telemetry", "test", "--help"], "Usage: usagemax telemetry test"],
  ]) {
    const { stdout } = await exec(process.execPath, [cli, ...args], {
      env: { ...process.env, USAGEMAX_CONFIG_DIR: "/path/that/does/not/exist" },
    });
    assert.match(stdout, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("unknown sync flags fail before any sync work starts", async () => {
  await assert.rejects(
    exec(process.execPath, [cli, "sync", "--definitely-not-a-sync-option"], {
      env: { ...process.env, USAGEMAX_CONFIG_DIR: "/path/that/does/not/exist", USAGEMAX_DISABLE_UPDATE_CHECK: "1" },
    }),
    (error) => error.code === 1 && /Unknown option for sync/.test(error.stderr),
  );
});
