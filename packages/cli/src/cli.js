#!/usr/bin/env node

import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { promisify } from "node:util";

import { batchId, buildDeltaPlan, normalizeLinkCode, sourceSummary, validHttpsUrl } from "./core.js";

const require = createRequire(import.meta.url);
const executeFile = promisify(execFile);
const VERSION = "0.1.0";
const DEFAULT_LINK_ENDPOINT = "https://rapid-rhinoceros-943.convex.site/v1/devices/link";
const CONFIG_FILE = "config.json";
const MAX_REPORT_BYTES = 100 * 1024 * 1024;

function configDirectory() {
  if (process.env.USAGEMAX_CONFIG_DIR) return process.env.USAGEMAX_CONFIG_DIR;
  if (platform() === "win32") return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "UsageMax");
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "usagemax");
}

function configPath() {
  return join(configDirectory(), CONFIG_FILE);
}

async function readConfig() {
  try {
    const parsed = JSON.parse(await readFile(configPath(), "utf8"));
    if (!parsed || parsed.version !== 1 || !/^umx_[a-f0-9]{64}$/.test(parsed.token || "")) return null;
    if (!validHttpsUrl(parsed.ingestUrl, { allowLocalhost: true })) return null;
    if (typeof parsed.deviceId !== "string" || !parsed.deviceId) return null;
    parsed.snapshots = parsed.snapshots && typeof parsed.snapshots === "object" ? parsed.snapshots : {};
    return parsed;
  } catch {
    return null;
  }
}

async function writeConfig(config) {
  const path = configPath();
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, `.config.${process.pid}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await rename(temporary, path);
    if (platform() !== "win32") await chmod(path, 0o600);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function deviceLabel() {
  if (platform() === "darwin") return "Mac";
  if (platform() === "win32") return "Windows PC";
  if (platform() === "linux") return "Linux computer";
  return "Computer";
}

function help() {
  process.stdout.write(`UsageMax ${VERSION}\n\n`);
  process.stdout.write("Link aggregate coding-agent usage to your UsageMax profile.\n\n");
  process.stdout.write("Commands:\n");
  process.stdout.write("  usagemax                         Sync changed local usage\n");
  process.stdout.write("  usagemax link <one-use-code>     Link and sync this computer\n");
  process.stdout.write("           [--no-sync] [--name <name>]\n");
  process.stdout.write("  usagemax sync [--full] [--json] Sync usage once, then exit\n");
  process.stdout.write("  usagemax status                  Show local link status\n");
  process.stdout.write("  usagemax doctor                  Check source detection\n");
  process.stdout.write("  usagemax report [...args]        Run a local ccusage report\n");
  process.stdout.write("  usagemax unlink                  Remove the local collector key\n");
}

function ccusageCliPath() {
  return join(dirname(require.resolve("ccusage/package.json")), "src", "cli.js");
}

async function ccusageJson(config, { full = false } = {}) {
  const args = [ccusageCliPath(), "daily", "--json", "--offline", "--by-agent", "--order", "asc"];
  if (!full && config?.lastSyncAt) args.push("--last", "14");
  const { stdout } = await executeFile(process.execPath, args, {
    encoding: "utf8",
    maxBuffer: MAX_REPORT_BYTES,
    env: { ...process.env, NO_COLOR: "1" },
  });
  return JSON.parse(stdout);
}

async function link(args) {
  const code = normalizeLinkCode(args[0]);
  if (!code) throw new Error("Paste the one-use UMX link code shown at usagemax.com/account.");
  const configuredEndpoint = process.env.USAGEMAX_LINK_ENDPOINT || DEFAULT_LINK_ENDPOINT;
  const endpoint = validHttpsUrl(configuredEndpoint, { allowLocalhost: true });
  if (!endpoint) throw new Error("USAGEMAX_LINK_ENDPOINT must use HTTPS, except for localhost development.");
  const name = (option(args, "--name") || deviceLabel()).trim().slice(0, 80);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, name, platform: platform(), cliVersion: VERSION }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error === "invalid_or_expired_link_code" ? "That link code is invalid, expired, or already used." : "UsageMax could not link this computer.");
  const ingestUrl = validHttpsUrl(body.ingestUrl, { allowLocalhost: true });
  if (!/^umx_[a-f0-9]{64}$/.test(body.token || "") || !ingestUrl) throw new Error("UsageMax returned an invalid link response.");
  const config = {
    version: 1,
    token: body.token,
    ingestUrl,
    profileUrl: validHttpsUrl(body.profileUrl) || "https://usagemax.com/account",
    profileHandle: typeof body.profileHandle === "string" ? body.profileHandle : undefined,
    deviceId: randomUUID(),
    deviceName: name,
    linkedAt: new Date().toISOString(),
    snapshots: {},
  };
  await writeConfig(config);
  process.stdout.write(`Linked ${name} to ${config.profileHandle ? `@${config.profileHandle}` : "UsageMax"}.\n`);
  if (args.includes("--no-sync")) {
    process.stdout.write("No usage was uploaded. Run `bunx usagemax sync --full` when you are ready.\n");
    return;
  }
  process.stdout.write("Running the first one-shot sync…\n");
  await sync(["--full"], config);
}

async function sync(args, suppliedConfig) {
  const config = suppliedConfig || await readConfig();
  if (!config) throw new Error("This computer is not linked. Open https://usagemax.com/account and create a link code.");
  const report = await ccusageJson(config, { full: args.includes("--full") });
  const { plan, regressions } = buildDeltaPlan(report, config.snapshots, config.deviceId, "ccusage@20.0.20");
  let accepted = 0;
  for (let offset = 0; offset < plan.length; offset += 100) {
    const batch = plan.slice(offset, offset + 100);
    const events = batch.map((item) => item.event);
    const response = await fetch(config.ingestUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
        "idempotency-key": batchId(config.deviceId, events),
      },
      body: JSON.stringify({ events }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error === "unauthorized" ? "This collector key is no longer valid. Link the computer again." : `UsageMax rejected a sync batch (${response.status}).`);
    accepted += Number(body.accepted || 0);
    for (const item of batch) config.snapshots[item.snapshotKey] = item.snapshot;
    config.lastSyncAt = new Date().toISOString();
    await writeConfig(config);
  }
  if (!plan.length) {
    config.lastSyncAt = new Date().toISOString();
    await writeConfig(config);
  }
  const result = { accepted, changedRows: plan.length, sources: sourceSummary(report), regressions: regressions.length };
  if (args.includes("--json")) process.stdout.write(`${JSON.stringify(result)}\n`);
  else {
    process.stdout.write(plan.length ? `Synced ${accepted} changed usage rows from ${result.sources.join(", ") || "local agents"}.\n` : "Already up to date. No usage rows were uploaded.\n");
    if (regressions.length) process.stdout.write(`${regressions.length} local row(s) moved backward; UsageMax kept the prior high-water mark to prevent double counting.\n`);
  }
}

async function status() {
  const config = await readConfig();
  if (!config) {
    process.stdout.write("Not linked. Open https://usagemax.com/account to connect this computer.\n");
    return;
  }
  process.stdout.write(`Linked: ${config.deviceName || deviceLabel()}${config.profileHandle ? ` → @${config.profileHandle}` : ""}\n`);
  process.stdout.write(`Last sync: ${config.lastSyncAt || "never"}\n`);
  process.stdout.write(`Profile: ${config.profileUrl || "https://usagemax.com/account"}\n`);
}

async function doctor() {
  const config = await readConfig();
  const report = await ccusageJson(config, { full: false });
  process.stdout.write(`Collector: ${config ? "linked" : "not linked"}\n`);
  process.stdout.write(`Detected sources: ${sourceSummary(report).join(", ") || "none"}\n`);
  process.stdout.write("Mode: one-shot, offline pricing cache, aggregate counters only\n");
}

async function report(args) {
  const forwarded = args.length ? args : ["daily"];
  const child = spawn(process.execPath, [ccusageCliPath(), ...forwarded], { stdio: "inherit", env: process.env });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (status) => resolve(status ?? 1));
  });
  if (code !== 0) process.exitCode = code;
}

async function removeLink() {
  const path = configPath();
  const config = await readConfig();
  if (!config) {
    process.stdout.write("This computer is not linked.\n");
    return;
  }
  await unlink(path);
  process.stdout.write("Removed the local UsageMax collector key. Revoke the collector in your account if this computer is no longer trusted.\n");
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "sync";
  if (["--help", "-h", "help"].includes(command)) return help();
  if (["--version", "-v"].includes(command)) return process.stdout.write(`${VERSION}\n`);
  if (command === "link") return link(args.slice(1));
  if (command === "sync") return sync(args.slice(1));
  if (command === "status") return status();
  if (command === "doctor") return doctor();
  if (command === "report") return report(args.slice(1));
  if (command === "unlink") return removeLink();
  throw new Error(`Unknown command: ${command}. Run usagemax --help.`);
}

main().catch((error) => {
  process.stderr.write(`UsageMax: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
