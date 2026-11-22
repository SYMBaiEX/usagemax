import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHmac } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { productAnalyticsStatus, recordProductAnalytics, setProductAnalyticsEnabled } from "./product-analytics.js";

const exec = promisify(execFile);
const cli = fileURLToPath(new URL("./cli.js", import.meta.url));
const firstDay = new Date("2026-11-21T23:59:59Z");
const nextDay = new Date("2026-11-22T00:00:00Z");

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "usagemax-cli-analytics-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const config = join(root, "config");
  const state = join(config, "cli-analytics", "settings.json");
  return { root, config, state };
}

function interactive(overrides = {}) {
  return {
    command: "sync",
    args: [],
    cliVersion: "0.3.13",
    env: {},
    now: firstDay,
    stdin: { isTTY: true },
    stdout: { isTTY: true },
    stderr: { isTTY: true, write() {} },
    ...overrides,
  };
}

test("prints a notice before the first POST and sends an unlinkable daily identifier", async (t) => {
  const { config, state } = await fixture(t);
  const notices = [];
  const events = [];
  t.mock.method(globalThis, "fetch", async (url, request) => {
    assert.equal(notices.length, 1);
    assert.equal(url, "https://usagemax.com/api/v1/cli-analytics");
    assert.equal(request.method, "POST");
    assert.equal(request.credentials, "omit");
    assert.equal(request.redirect, "error");
    assert.ok(request.signal instanceof AbortSignal);
    assert.deepEqual(request.headers, { "content-type": "application/json" });
    const body = JSON.parse(request.body);
    const settings = JSON.parse(await readFile(state, "utf8"));
    assert.equal(settings.lastAttemptDay, body.day);
    assert.equal(body.dailyId, createHmac("sha256", Buffer.from(settings.seed, "hex")).update(body.day).digest("hex"));
    assert.ok(!request.body.includes(settings.seed));
    events.push(body);
    return new Response(null, { status: 204 });
  });
  const options = interactive({
    command: "link",
    args: ["UMX-ABCD-EFGH-JKMN-PQRS", "--name", "private computer name"],
    env: { USAGEMAX_TOKEN: "private token" },
    stderr: { isTTY: true, write: (message) => notices.push(message) },
  });
  await Promise.all([recordProductAnalytics(config, options), recordProductAnalytics(config, options)]);
  await recordProductAnalytics(config, options);
  await recordProductAnalytics(config, { ...options, now: nextDay });
  assert.equal(notices.length, 1);
  assert.match(notices[0], /usagemax telemetry disable/);
  assert.equal(events.length, 2);
  assert.deepEqual(events.map((event) => event.day), ["2026-11-21", "2026-11-22"]);
  assert.notEqual(events[0].dailyId, events[1].dailyId);
  for (const event of events) {
    assert.deepEqual(Object.keys(event).sort(), ["arch", "cliVersion", "dailyId", "day", "platform", "schemaVersion"]);
    assert.equal(event.schemaVersion, 1);
    assert.equal(event.cliVersion, "0.3.13");
    assert.match(event.dailyId, /^[0-9a-f]{64}$/);
    assert.ok(["darwin", "linux", "win32", "other"].includes(event.platform));
    assert.ok(["x64", "arm64", "other"].includes(event.arch));
  }
});

test("does not create settings or send during noninteractive, CI, dry-run, quiet, or opt-out usage", async (t) => {
  const { config } = await fixture(t);
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 204 }));
  const cases = [
    { command: "service", args: ["run"] },
    { command: "telemetry", args: ["test"] },
    { command: "status" },
    ...["--json", "--quiet", "--no-progress", "--dry-run", "--help", "--version"].map((flag) => ({ args: [flag] })),
    { stdin: { isTTY: false } },
    { stdout: { isTTY: false } },
    { stderr: { isTTY: false } },
    { env: { CI: "true" } },
    { env: { DO_NOT_TRACK: "1" } },
    { env: { USAGEMAX_TELEMETRY_DISABLED: "1" } },
  ];
  for (const option of cases) await recordProductAnalytics(config, interactive(option));
  assert.equal(fetch.mock.callCount(), 0);
  await assert.rejects(access(config), { code: "ENOENT" });
});

test("disable removes the seed, survives restart, and retains the daily limit", async (t) => {
  const { config, state } = await fixture(t);
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 204 }));
  assert.deepEqual(await productAnalyticsStatus(config, {}), { enabled: true, preference: "default", disabledBy: null });
  await assert.rejects(access(config), { code: "ENOENT" });
  await recordProductAnalytics(config, interactive());
  const originalSeed = JSON.parse(await readFile(state, "utf8")).seed;
  assert.deepEqual(await setProductAnalyticsEnabled(config, false, {}), { enabled: false, preference: "disabled", disabledBy: "preference" });
  assert.deepEqual(JSON.parse(await readFile(state, "utf8")), { version: 1, enabled: false, lastAttemptDay: "2026-11-21" });
  assert.equal((await productAnalyticsStatus(config, {})).enabled, false);
  await recordProductAnalytics(config, interactive({ now: nextDay }));
  assert.equal(fetch.mock.callCount(), 1);
  assert.deepEqual(await setProductAnalyticsEnabled(config, true, { DO_NOT_TRACK: "1" }), { enabled: false, preference: "enabled", disabledBy: "DO_NOT_TRACK" });
  await recordProductAnalytics(config, interactive());
  assert.equal(fetch.mock.callCount(), 1);
  await recordProductAnalytics(config, interactive({ now: nextDay }));
  assert.equal(fetch.mock.callCount(), 2);
  assert.notEqual(JSON.parse(await readFile(state, "utf8")).seed, originalSeed);
});

test("malformed preferences fail closed and failed network requests do not retry", async (t) => {
  const { config, state } = await fixture(t);
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("offline"); });
  await mkdir(join(config, "cli-analytics"), { recursive: true });
  await writeFile(state, "{malformed");
  assert.deepEqual(await productAnalyticsStatus(config, {}), { enabled: false, preference: "unavailable", disabledBy: "settings_unavailable" });
  await recordProductAnalytics(config, interactive());
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(await readFile(state, "utf8"), "{malformed");
  await setProductAnalyticsEnabled(config, true, {});
  await recordProductAnalytics(config, interactive());
  await recordProductAnalytics(config, interactive());
  assert.equal(fetch.mock.callCount(), 1);
  await recordProductAnalytics(config, interactive({ now: nextDay }));
  assert.equal(fetch.mock.callCount(), 2);
});

test("CLI telemetry commands work without a linked computer and preserve collector test help", async (t) => {
  const { config } = await fixture(t);
  const env = { ...process.env, USAGEMAX_CONFIG_DIR: config, CI: "", DO_NOT_TRACK: "", USAGEMAX_TELEMETRY_DISABLED: "" };
  const invoke = (...args) => exec(process.execPath, [cli, ...args], { env });
  assert.deepEqual(JSON.parse((await invoke("telemetry", "status", "--json")).stdout), { enabled: true, preference: "default", disabledBy: null });
  await assert.rejects(access(config), { code: "ENOENT" });
  assert.match((await invoke("telemetry", "test", "--help")).stdout, /collector|smoke test|write path/i);
  assert.match((await invoke("telemetry", "--help")).stdout, /status\|disable\|enable/);
  assert.equal(JSON.parse((await invoke("telemetry", "disable", "--json")).stdout).enabled, false);
  assert.equal(JSON.parse((await invoke("telemetry", "status", "--json")).stdout).enabled, false);
  assert.equal(JSON.parse((await invoke("telemetry", "enable", "--json")).stdout).enabled, true);
});

test("only a successful interactive collector command sends the daily signal", async (t) => {
  const { config, root, state } = await fixture(t);
  const preload = join(root, "mock-terminal.mjs");
  await writeFile(preload, [
    'for (const stream of [process.stdin, process.stdout, process.stderr]) Object.defineProperty(stream, "isTTY", { value: true });',
    'globalThis.fetch = async () => {',
    '  process.stderr.write("mock product telemetry request\\n");',
    '  return new Response(null, { status: 204 });',
    '};',
  ].join("\n"));
  const env = {
    ...process.env, HOME: root, USERPROFILE: root, APPDATA: root, LOCALAPPDATA: root,
    XDG_CONFIG_HOME: root, XDG_DATA_HOME: root, USAGEMAX_CONFIG_DIR: config,
    USAGEMAX_DISABLE_UPDATE_CHECK: "1", CI: "", DO_NOT_TRACK: "", USAGEMAX_TELEMETRY_DISABLED: "",
  };
  const invoke = (...args) => exec(process.execPath, ["--import", pathToFileURL(preload).href, cli, ...args], { env, cwd: root });
  const requestMarker = "mock product telemetry request";
  for (const args of [["--version"], ["doctor", "--help"], ["doctor", "--json"]]) {
    assert.ok(!(await invoke(...args)).stderr.includes(requestMarker));
  }
  await assert.rejects(invoke("sync"), (error) => {
    assert.match(error.stderr, /not linked/i);
    assert.ok(!error.stderr.includes(requestMarker));
    return true;
  });
  await assert.rejects(access(state), { code: "ENOENT" });
  const doctor = await invoke("doctor");
  const notice = doctor.stderr.indexOf("usagemax telemetry disable");
  assert.ok(notice >= 0 && doctor.stderr.indexOf(requestMarker) > notice);
  assert.ok(!(await invoke("doctor")).stderr.includes(requestMarker));
});
