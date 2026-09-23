import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkForUpdate, compareVersions, packageManagerFor, REGISTRY_URL, runLatest, updateCommandWillRun, updateGlobal, updateRequest } from "./updates.js";

test("compares strict semantic versions", () => {
  assert.equal(compareVersions("0.3.7", "0.3.6"), 1);
  assert.equal(compareVersions("0.3.6", "0.3.6"), 0);
  assert.equal(compareVersions("0.3.5", "0.3.6"), -1);
  assert.equal(compareVersions("latest", "0.3.6"), 0);
});

test("update check-only options never create a command handoff", () => {
  assert.deepEqual(updateRequest(["sync"]), {
    json: false,
    checkOnly: false,
    commandArgs: ["sync"],
    handoffArgs: ["sync"],
  });
  assert.deepEqual(updateRequest(["--check", "sync", "--json"]), {
    json: true,
    checkOnly: true,
    commandArgs: ["sync"],
    handoffArgs: [],
  });
  assert.deepEqual(updateRequest(["token", "status", "--no-install"]), {
    json: false,
    checkOnly: true,
    commandArgs: ["token", "status"],
    handoffArgs: [],
  });
});

test("verified current and newer releases run suffixes; check-only and unavailable checks do not", () => {
  const commandArgs = ["sync"];
  assert.equal(updateCommandWillRun({ latest: "0.3.11", checkOnly: false, commandArgs }), true);
  assert.equal(updateCommandWillRun({ latest: "0.3.11", checkOnly: false, commandArgs }), true);
  assert.equal(updateCommandWillRun({ latest: "0.3.11", checkOnly: true, commandArgs }), false);
  assert.equal(updateCommandWillRun({ latest: null, checkOnly: false, commandArgs }), false);
  assert.equal(updateCommandWillRun({ latest: "0.3.11", checkOnly: false }), false);
});
test("caches the npm check and reports a newer release", async () => {
  const directory = await mkdtemp(join(tmpdir(), "usagemax-updates-"));
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    assert.equal(url, REGISTRY_URL);
    return new Response(JSON.stringify({ version: "0.3.7" }), { status: 200 });
  };
  try {
    const first = await checkForUpdate(directory, "0.3.6", { now: 1000, fetchImpl });
    const second = await checkForUpdate(directory, "0.3.6", { now: 1001, fetchImpl });
    assert.equal(first.newer, true);
    assert.equal(second.newer, true);
    assert.equal(calls, 1);
    assert.match(await readFile(join(directory, "update-check.json"), "utf8"), /0\.3\.7/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("failed registry checks remain non-fatal", async () => {
  const directory = await mkdtemp(join(tmpdir(), "usagemax-updates-"));
  try {
    const result = await checkForUpdate(directory, "0.3.6", { fetchImpl: async () => { throw new Error("offline"); } });
    assert.equal(result.latest, null);
    assert.equal(result.newer, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("detects the package manager from Bun paths and npm environments", () => {
  assert.equal(packageManagerFor({ cliPath: "/Users/a/.bun/install/global/node_modules/usagemax/src/cli.js", runtime: {}, env: {} }), "bun");
  assert.equal(packageManagerFor({ cliPath: "/Users/a/.npm/_npx/123/node_modules/usagemax/src/cli.js", runtime: {}, env: { npm_execpath: "/usr/local/bin/npm" } }), "npm");
  assert.equal(packageManagerFor({ cliPath: "/tmp/usagemax/src/cli.js", runtime: { bun: "1.2.3" }, env: {} }), "bun");
  assert.equal(packageManagerFor({ cliPath: "/tmp/usagemax/src/cli.js", runtime: {}, env: { USAGEMAX_PACKAGE_MANAGER: "bun" } }), "bun");
});

test("updates the global package through the selected package manager", async () => {
  const calls = [];
  const child = new EventEmitter();
  const result = updateGlobal({
    latest: "0.3.9",
    manager: "bun",
    env: { PATH: "/bin" },
    spawnImpl: (command, args, options) => {
      calls.push({ command, args, options });
      queueMicrotask(() => child.emit("exit", 0));
      return child;
    },
  });
  await result;
  assert.deepEqual(calls[0].args, ["add", "--global", "usagemax@0.3.9"]);
  assert.equal(calls[0].options.env.NPM_CONFIG_UPDATE_NOTIFIER, "false");
});

test("uses Windows package-manager entrypoints without a shell", async () => {
  const child = new EventEmitter();
  const calls = [];
  const result = updateGlobal({
    latest: "0.3.9",
    manager: "npm",
    platform: "win32",
    spawnImpl: (command, args) => {
      calls.push({ command, args });
      queueMicrotask(() => child.emit("exit", 0));
      return child;
    },
  });
  await result;
  assert.deepEqual(calls[0], { command: "npm.cmd", args: ["install", "--global", "usagemax@0.3.9"] });
});

test("quiet JSON updates discard child output instead of leaving pipes undrained", async () => {
  const child = new EventEmitter();
  let options;
  const result = updateGlobal({
    latest: "0.3.11",
    manager: "npm",
    quiet: true,
    spawnImpl: (_command, _args, spawnOptions) => {
      options = spawnOptions;
      queueMicrotask(() => child.emit("exit", 0));
      return child;
    },
  });
  await result;
  assert.equal(options.stdio, "ignore");
});

test("latest command handoff chooses npm exec for an npm-global installation", async () => {
  const child = new EventEmitter();
  let invocation;
  await runLatest(["sync", "--json"], {
    cliPath: "/usr/local/lib/node_modules/usagemax/src/cli.js",
    runtime: {},
    env: { PATH: "/usr/bin", npm_execpath: undefined },
    platform: "linux",
    spawnImpl: (command, args, options) => {
      invocation = { command, args, options };
      queueMicrotask(() => child.emit("exit", 0));
      return child;
    },
  });
  assert.equal(invocation.command, "npm");
  assert.deepEqual(invocation.args, ["exec", "--yes", "usagemax@latest", "--", "sync", "--json"]);
  assert.equal(invocation.options.env.USAGEMAX_UPDATE_HANDOFF, "1");
  assert.equal(invocation.options.stdio, "inherit");
});

test("latest command handoff uses bunx for a Bun-global installation", async () => {
  const child = new EventEmitter();
  let invocation;
  await runLatest(["sync", "--json"], {
    cliPath: "/Users/a/.bun/install/global/node_modules/usagemax/src/cli.js",
    runtime: {},
    env: { PATH: "/bin" },
    platform: "linux",
    spawnImpl: (command, args, options) => {
      invocation = { command, args, options };
      queueMicrotask(() => child.emit("exit", 0));
      return child;
    },
  });
  assert.equal(invocation.command, "bunx");
  assert.deepEqual(invocation.args, ["--bun", "usagemax@latest", "--", "sync", "--json"]);
  assert.equal(invocation.options.env.USAGEMAX_UPDATE_HANDOFF, "1");
  assert.equal(invocation.options.stdio, "inherit");
});
