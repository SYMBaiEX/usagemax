import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assertDurablePath, capturedEnvironment, intervalMinutes, manageService, runScheduledSync, servicePlan } from "./service.js";

const options = { directory: "/users/test/config", executable: "/opt/node", cli: "/opt/Usage Max/src/cli.js", home: "/users/test", uid: 123, now: 0 };

test("intervals are bounded and integer-only", () => {
  assert.equal(intervalMinutes(), 15);
  assert.equal(intervalMinutes("5"), 5);
  assert.equal(intervalMinutes("1440"), 1440);
  for (const input of [0, -1, 4, 1441, "15;exit", "2.5", "", "NaN"]) assert.throws(() => intervalMinutes(input));
});

test("ephemeral launchers fail with a global-install remedy", () => {
  for (const path of ["relative.js", "/home/a/.npm/_npx/123/cli.js", "/home/a/.bun/install/cache/usagemax/cli.js", "/home/a/fnm_multishells/123/node", "/opt/cli\n.js"]) assert.throws(() => assertDurablePath(path), /persistent installation/);
  assert.doesNotThrow(() => assertDurablePath("/home/a/.bun/install/global/node_modules/usagemax/src/cli.js"));
});

test("only explicit discovery environment is persisted; no credentials", () => {
  assert.deepEqual(capturedEnvironment({ PATH: "/bin", CODEX_HOME: "/logs", CLAUDE_CONFIG_DIR: "", OPENAI_API_KEY: "secret", USAGEMAX_TOKEN: "secret", NODE_OPTIONS: "--import=evil", HOME: "/another-user" }), { PATH: "/bin", CODEX_HOME: "/logs", CLAUDE_CONFIG_DIR: "" });
});

test("launchd is a low-priority interval job with no KeepAlive, shell, or log growth", () => {
  const plan = servicePlan({ ...options, platform: "darwin" });
  const plist = plan.files[0][1];
  assert.match(plist, /<key>StartInterval<\/key><integer>9\d\d<\/integer>/);
  assert.match(plist, /<string>\/opt\/Usage Max\/src\/cli.js<\/string>/);
  assert.doesNotMatch(plist, /<string>\/opt\/node<\/string>/);
  assert.match(plist, /LowPriorityIO/);
  assert.doesNotMatch(plist, /KeepAlive|RunAtLoad|bunx|npx/);
  assert.deepEqual(plan.probe, ["launchctl", ["print", `gui/123/${plan.name}`]]);
  assert.match(servicePlan({ ...options, home: "/a&b", platform: "darwin" }).files[0][1], /a&amp;b/);
});

test("systemd uses one-shot completion-relative timer, scheduler jitter and escaped arguments", () => {
  const plan = servicePlan({ ...options, cli: '/opt/a%u$VAR"x/cli.js', platform: "linux" });
  assert.match(plan.files[0][1], /a%%u\$\$VAR\\"x/);
  assert.match(plan.files[0][1], /Type=oneshot/);
  assert.match(plan.files[1][1], /OnUnitInactiveSec=15m/);
  assert.match(plan.files[1][1], /RandomizedDelaySec=60/);
  assert.doesNotMatch(plan.files[0][1], /Restart=/);
});

test("Windows task is least-privilege, nonoverlapping, does not wake or launch a shell", () => {
  const plan = servicePlan({ ...options, platform: "win32" });
  const task = plan.files[0][1];
  assert.match(task, /<Interval>PT15M/);
  assert.match(task, /<MultipleInstancesPolicy>IgnoreNew/);
  assert.match(task, /<RunLevel>LeastPrivilege/);
  assert.match(task, /<WakeToRun>false/);
  assert.match(task, /&quot;\/opt\/Usage Max\/src\/cli.js&quot;/);
  assert.doesNotMatch(task, /cmd.exe|powershell|Password/);
});

test("scheduler names isolate collector configuration directories", () => {
  const plan = servicePlan({ ...options, platform: "linux" });
  assert.match(plan.name, /UsageMax/);
  assert.notEqual(plan.name, servicePlan({ ...options, directory: "/different/config", platform: "linux" }).name);
  assert.throws(() => servicePlan({ ...options, platform: "freebsd" }), /supports/);
  assert.throws(() => servicePlan({ ...options, home: "/tmp/\ninjection", platform: "linux" }), /control characters/);
});

test("scheduled sync backs off, bounds status data, recovers, and preserves checkpoints", async () => {
  const directory = await mkdtemp(join(tmpdir(), "usagemax-service-"));
  try {
    let timestamp = 1000000;
    const env = {};
    const runtime = { now: () => timestamp, env };
    let calls = 0;
    const action = async () => { calls++; throw new Error("secret-token /private/path"); };
    assert.equal((await runScheduledSync(directory, action, runtime)).status, "disabled");
    await writeFile(join(directory, "service.json"), JSON.stringify({ minutes: 15, env: { CODEX_HOME: "/logs", API_KEY: "secret" } }));
    await writeFile(join(directory, "config.json"), "untouched checkpoint");
    const failure = await runScheduledSync(directory, action, runtime);
    assert.equal(failure.failures, 1);
    assert.equal(failure.nextAttemptAt, timestamp + 30 * 60000);
    assert.equal((await runScheduledSync(directory, action, runtime)).status, "backoff");
    assert.equal(calls, 1);
    assert.equal(env.CODEX_HOME, "/logs");
    assert.equal(env.API_KEY, undefined);
    const saved = await readFile(join(directory, "service-state.json"), "utf8");
    assert.doesNotMatch(saved, /secret|private\/path/);
    assert.ok(saved.length < 512);
    timestamp = failure.nextAttemptAt;
    const success = await runScheduledSync(directory, async () => { calls++; }, runtime);
    assert.equal(success.status, "ok");
    assert.equal(success.failures, 0);
    assert.equal(success.nextAttemptAt, undefined);
    assert.equal(await readFile(join(directory, "config.json"), "utf8"), "untouched checkpoint");
    const busy = await runScheduledSync(directory, async () => { throw Object.assign(new Error("busy"), { code: "USAGEMAX_BUSY" }); }, runtime);
    assert.equal(busy.status, "busy");
    assert.equal(JSON.parse(await readFile(join(directory, "service-state.json"), "utf8")).status, "ok");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("install/update/status/uninstall use only scoped files and preserve linked data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "usagemax-service-install-"));
  try {
    await writeFile(join(directory, "config.json"), "private checkpoint");
    const calls = [];
    const runtime = { directory, home: directory, platform: "linux", cli: fileURLToPath(import.meta.url), env: { XDG_CONFIG_HOME: join(directory, "xdg"), OPENAI_API_KEY: "never-save" }, executeCommand: async (command) => { calls.push(command); return { stdout: "active" }; } };
    const installed = await manageService("install", runtime);
    assert.equal(installed.minutes, 15);
    assert.equal((await manageService("status", runtime)).schedulerReachable, true);
    assert.equal((await manageService("install", { ...runtime, minutes: 30 })).minutes, 30);
    assert.ok(calls.some(([, args]) => args.includes("disable")));
    assert.doesNotMatch(await readFile(join(directory, "service.json"), "utf8"), /never-save|OPENAI_API_KEY/);
    assert.equal((await manageService("uninstall", runtime)).installed, false);
    assert.equal((await manageService("uninstall", runtime)).installed, false);
    assert.equal(await readFile(join(directory, "config.json"), "utf8"), "private checkpoint");
    await assert.rejects(readFile(join(directory, "service.json")), { code: "ENOENT" });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("missing systemd user manager fails before scheduler files are written", async () => {
  const directory = await mkdtemp(join(tmpdir(), "usagemax-no-systemd-"));
  try {
    await writeFile(join(directory, "config.json"), "checkpoint");
    await assert.rejects(manageService("install", { directory, home: directory, platform: "linux", cli: fileURLToPath(import.meta.url), env: {}, executeCommand: async () => { throw new Error("No user manager"); } }), /No user manager/);
    await assert.rejects(readFile(join(directory, "service.json")), { code: "ENOENT" });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("macOS native plist parser accepts generated job", { skip: process.platform !== "darwin" }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "usagemax-plist-"));
  try {
    const file = join(directory, "job.plist");
    await writeFile(file, servicePlan({ ...options, platform: "darwin" }).files[0][1]);
    await promisify(execFile)("plutil", ["-lint", file]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("native macOS scheduler starts and exits an isolated disabled collector", { skip: process.platform !== "darwin" || process.env.USAGEMAX_NATIVE_SCHEDULER_TEST !== "1" }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "usagemax-native-job-"));
  const exec = promisify(execFile);
  const plan = servicePlan({ directory, home: directory, executable: process.execPath, cli: fileURLToPath(new URL("./cli.js", import.meta.url)) });
  let registered = false;
  try {
    for (const [file, content] of plan.files) {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, content);
    }
    for (const [command, args] of plan.install) { await exec(command, args); registered = true; }
    await exec("launchctl", ["kickstart", `gui/${process.getuid()}/${plan.name}`]);
    let completed = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      const { stdout } = await exec(...plan.probe);
      if (/last exit code = 0/.test(stdout) && /state = not running/.test(stdout)) { completed = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(completed, "Temporary native job should exit successfully, not remain resident");
    await assert.rejects(readFile(join(directory, "config.json")), { code: "ENOENT" });
    await assert.rejects(readFile(join(directory, "service-state.json")), { code: "ENOENT" });
  } finally {
    if (registered) for (const command of plan.uninstall) await exec(...command);
    await rm(directory, { recursive: true, force: true });
  }
});
