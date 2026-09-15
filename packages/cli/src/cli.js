#!/usr/bin/env node

import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { promisify } from "node:util";

import { prepareArchiveRecovery } from "./archives.js";
import { buildSessionPlan, buildSnapshotPlan, normalizeLinkCode, sourceSummary, validHttpsUrl } from "./core.js";
import { stableInstallationId } from "./installation.js";
import { CCUSAGE_VERSION, ccusageEnvironment, ccusageHome, discoverProviderArchives, SOURCE_INVENTORY_VERSION, sourceInventory, SUPPORTED_SOURCES } from "./sources.js";

const require = createRequire(import.meta.url);
const executeFile = promisify(execFile);
const VERSION = "0.3.0";
const DEFAULT_LINK_ENDPOINT = "https://terrific-bobcat-522.convex.site/v1/devices/link";
const CONFIG_FILE = "config.json";
const MAX_REPORT_BYTES = 100 * 1024 * 1024;
const FULL_RECONCILE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

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
    parsed.snapshotUrl = validHttpsUrl(parsed.snapshotUrl, { allowLocalhost: true })
      || parsed.ingestUrl.replace(/\/v1\/telemetry\/llm$/, "/v2/usage/snapshots");
    parsed.revokeUrl = validHttpsUrl(parsed.revokeUrl, { allowLocalhost: true })
      || parsed.ingestUrl.replace(/\/v1\/telemetry\/llm$/, "/v1/devices/revoke");
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
  if (platform() === "linux" && process.env.WSL_DISTRO_NAME) return `WSL · ${process.env.WSL_DISTRO_NAME}`;
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
  process.stdout.write("  usagemax sync [--full] [--archives] [--dry-run] [--explain] [--json]\n");
  process.stdout.write("                                  Reconcile once; --archives performs one-time recovery\n");
  process.stdout.write("  usagemax status                  Show local link status\n");
  process.stdout.write("  usagemax doctor [--deep] [--json]\n");
  process.stdout.write("                                  Check source coverage; --deep parses full history\n");
  process.stdout.write("  usagemax report [...args]        Run a local ccusage report\n");
  process.stdout.write("  usagemax unlink [--revoke]       Remove locally; --revoke also disables uploads\n");
}

function ccusageCliPath() {
  return join(dirname(require.resolve("ccusage/package.json")), "src", "cli.js");
}

async function ccusageJson(config, { full = false, env } = {}) {
  const args = [ccusageCliPath(), "daily", "--json", "--offline", "--mode", "calculate", "--timezone", "UTC", "--by-agent", "--order", "asc"];
  args.push("--sections", "daily,session");
  // Reconcile yesterday once after the UTC date changes. All other incremental
  // scans parse only today; a metadata fingerprint avoids invoking ccusage when
  // no supported local source changed at all.
  if (full) {
    args.push("--since", "2024-01-01", "--until", new Date().toISOString().slice(0, 10));
  } else if (config?.lastSyncAt) {
    const today = new Date().toISOString().slice(0, 10);
    args.push("--last", config.lastReconciledDay === today ? "1" : "2");
  }
  const { stdout } = await executeFile(process.execPath, args, {
    encoding: "utf8",
    maxBuffer: MAX_REPORT_BYTES,
    env: { ...(env || await ccusageEnvironment()), NO_COLOR: "1" },
  });
  return JSON.parse(stdout);
}

function snapshotEndpoint(config) {
  return validHttpsUrl(config.snapshotUrl, { allowLocalhost: true })
    || config.ingestUrl.replace(/\/v1\/telemetry\/llm$/, "/v2/usage/snapshots");
}

async function snapshotRequest(config, operation, payload, timeout = 30_000) {
  const response = await fetch(snapshotEndpoint(config), {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
      "x-usagemax-device-id": config.deviceId,
    },
    body: JSON.stringify({ operation, ...payload }),
    signal: AbortSignal.timeout(timeout),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (body?.error === "unauthorized") throw new Error("This collector key is no longer valid. Link the computer again.");
    throw new Error(`UsageMax rejected ${operation} (${response.status}${body?.error ? `: ${body.error}` : ""}).`);
  }
  return body;
}

function newerVersion(recommended) {
  if (!/^\d+\.\d+\.\d+$/.test(recommended || "")) return false;
  const current = VERSION.split(".").map(Number);
  const next = recommended.split(".").map(Number);
  return next.some((value, index) => value > current[index] && next.slice(0, index).every((prior, priorIndex) => prior === current[priorIndex]));
}

function warnVersion(body) {
  if (newerVersion(body?.recommendedCliVersion)) {
    process.stderr.write(`UsageMax ${body.recommendedCliVersion} is available. Run \`bunx usagemax@latest\` for current coverage fixes.\n`);
  }
}

async function link(args) {
  const code = normalizeLinkCode(args[0]);
  if (!code) throw new Error("Paste the one-use UMX link code shown at usagemax.com/account.");
  const configuredEndpoint = process.env.USAGEMAX_LINK_ENDPOINT || DEFAULT_LINK_ENDPOINT;
  const endpoint = validHttpsUrl(configuredEndpoint, { allowLocalhost: true });
  if (!endpoint) throw new Error("USAGEMAX_LINK_ENDPOINT must use HTTPS, except for localhost development.");
  const name = (option(args, "--name") || deviceLabel()).trim().slice(0, 80);
  const previous = await readConfig();
  const deviceId = await stableInstallationId(configDirectory(), previous?.deviceId);
  const headers = { "content-type": "application/json" };
  if (previous?.token) headers.authorization = `Bearer ${previous.token}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ code, name, platform: platform(), cliVersion: VERSION, deviceId }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error === "invalid_or_expired_link_code" ? "That link code is invalid, expired, or already used." : "UsageMax could not link this computer.");
  const ingestUrl = validHttpsUrl(body.ingestUrl, { allowLocalhost: true });
  const snapshotUrl = validHttpsUrl(body.snapshotUrl, { allowLocalhost: true }) || ingestUrl?.replace(/\/v1\/telemetry\/llm$/, "/v2/usage/snapshots");
  const revokeUrl = validHttpsUrl(body.revokeUrl, { allowLocalhost: true }) || ingestUrl?.replace(/\/v1\/telemetry\/llm$/, "/v1/devices/revoke");
  if (!/^umx_[a-f0-9]{64}$/.test(body.token || "") || !ingestUrl || !snapshotUrl || !revokeUrl) throw new Error("UsageMax returned an invalid link response.");
  const profileHandle = typeof body.profileHandle === "string" ? body.profileHandle : undefined;
  const sameAccount = Boolean(previous && previous.profileHandle && previous.profileHandle === profileHandle);
  const config = {
    version: 1,
    token: body.token,
    ingestUrl,
    snapshotUrl,
    revokeUrl,
    profileUrl: validHttpsUrl(body.profileUrl) || "https://usagemax.com/account",
    profileHandle,
    deviceId,
    deviceName: name,
    linkedAt: new Date().toISOString(),
    snapshots: sameAccount ? previous.snapshots : {},
  };
  await writeConfig(config);
  warnVersion(body);
  process.stdout.write(`Linked ${name} to ${config.profileHandle ? `@${config.profileHandle}` : "UsageMax"}.\n`);
  if (args.includes("--no-sync")) {
    process.stdout.write("No usage was uploaded. Run `bunx usagemax sync --full` when you are ready.\n");
    return;
  }
  process.stdout.write("Running the first one-shot sync…\n");
  await sync(["--full"], config);
}

async function sync(args, suppliedConfig) {
  const baseEnv = await ccusageEnvironment();
  const recovery = args.includes("--archives")
    ? await prepareArchiveRecovery(baseEnv)
    : { archives: 0, cleanup: async () => undefined, env: baseEnv, unsupported: 0 };
  try {
    return await syncPrepared(args, suppliedConfig, recovery);
  } finally {
    await recovery.cleanup();
  }
}

async function syncPrepared(args, suppliedConfig, recovery) {
  const config = suppliedConfig || await readConfig();
  if (!config) throw new Error("This computer is not linked. Open https://usagemax.com/account and create a link code.");
  config.deviceId = await stableInstallationId(configDirectory(), config.deviceId);
  const requestedFull = args.includes("--full");
  const requestedArchives = args.includes("--archives");
  const dryRun = args.includes("--dry-run");
  const explain = args.includes("--explain");
  const json = args.includes("--json");
  const inventory = await sourceInventory({ env: recovery.env, home: ccusageHome(recovery.env) });
  const today = new Date().toISOString().slice(0, 10);
  const knownSources = Array.isArray(config.knownSources) ? config.knownSources : [];
  const foundNewSource = inventory.sources.some((source) => !knownSources.includes(source));
  const lastFullSync = Date.parse(config.lastFullSyncAt || "");
  const fullDue = config.snapshotProtocolVersion !== 2
    || config.sourceInventoryVersion !== SOURCE_INVENTORY_VERSION
    || !Number.isFinite(lastFullSync)
    || Date.now() - lastFullSync >= FULL_RECONCILE_INTERVAL_MS
    || foundNewSource;
  const full = requestedFull || requestedArchives || fullDue;
  if (!full && inventory.complete && config.lastSyncComplete && config.lastReconciledDay === today && config.sourceFingerprint === inventory.fingerprint) {
    const result = { accepted: 0, changedRows: 0, sessions: 0, sources: inventory.sources, corrections: 0, scanned: false, full: false, coverage: inventory.complete ? "complete" : "partial" };
    if (json) process.stdout.write(`${JSON.stringify(result)}\n`);
    else process.stdout.write("Already up to date. Local usage files have not changed; no logs were parsed or uploaded.\n");
    return;
  }
  const report = await ccusageJson(config, { env: recovery.env, full });
  const runId = randomUUID();
  const revision = Date.now();
  const pricingVersion = `ccusage@${CCUSAGE_VERSION}`;
  const { partitions, nextSnapshots, regressions } = buildSnapshotPlan(report, config.snapshots, {
    bootstrap: config.snapshotProtocolVersion !== 2,
    complete: inventory.complete,
    full,
    pricingVersion,
    revision,
    runId,
  });
  const sessions = buildSessionPlan(report, config.deviceId);
  const sources = sourceSummary(report);
  const days = Array.isArray(report?.daily)
    ? report.daily.map((row) => row?.period).filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day || "")).sort()
    : [];
  const result = {
    accepted: 0,
    changedRows: partitions.reduce((sum, partition) => sum + partition.rows.filter((row) => JSON.stringify(row.previous) !== JSON.stringify(row.current)).length, 0),
    sessions: sessions.length,
    sources,
    corrections: regressions.length,
    partitions: partitions.length,
    scanned: true,
    full,
    coverage: inventory.complete && !inventory.truncated && inventory.errors === 0 ? "complete" : "partial",
    range: { from: days[0], to: days.at(-1) },
  };
  if (requestedArchives) {
    result.archives = recovery.archives;
    result.unsupportedArchives = recovery.unsupported;
  }
  if (dryRun) {
    if (json) process.stdout.write(`${JSON.stringify({ ...result, dryRun: true })}\n`);
    else {
      process.stdout.write(`Dry run: ${partitions.length} partition(s), ${result.changedRows} changed row(s), ${sessions.length} private session identifiers, no upload.\n`);
      if (explain) process.stdout.write(`Coverage ${result.coverage}; ${sources.length} source(s); ${days[0] || "unknown"} to ${days.at(-1) || "unknown"}; ${regressions.length} downward correction(s).\n`);
    }
    return result;
  }
  config.lastSyncComplete = false;
  await writeConfig(config);
  try {
    const begin = await snapshotRequest(config, "begin", {
      runId,
      mode: requestedArchives ? "archives" : full ? "full" : "incremental",
      sourceCount: sources.length,
      partitionCount: partitions.length,
      inventoryComplete: inventory.complete,
      inventoryErrors: inventory.errors,
      inventoryTruncated: inventory.truncated,
      coverageStartDay: days[0],
      coverageEndDay: days.at(-1),
    });
    warnVersion(begin);
    for (let offset = 0; offset < sessions.length; offset += 100) {
      await snapshotRequest(config, "sessions", { runId, sessions: sessions.slice(offset, offset + 100) });
    }
    for (let offset = 0; offset < partitions.length; offset += 10) {
      const response = await snapshotRequest(config, "partitions", { runId, partitions: partitions.slice(offset, offset + 10) }, 60_000);
      result.accepted += Number(response.changedRows || 0);
      if (!json && process.stderr.isTTY && partitions.length > 10) {
        process.stderr.write(`UsageMax: uploaded ${Math.min(offset + 10, partitions.length)}/${partitions.length} history partitions\r`);
      }
    }
    if (!json && process.stderr.isTTY && partitions.length > 10) process.stderr.write("\n");
    const completed = await snapshotRequest(config, "complete", { runId });
    warnVersion(completed);
    config.snapshots = nextSnapshots;
    config.snapshotProtocolVersion = 2;
    config.lastSyncAt = new Date().toISOString();
    config.lastReconciledDay = today;
    config.lastSyncComplete = true;
    config.sourceInventoryVersion = SOURCE_INVENTORY_VERSION;
    config.knownSources = [...new Set([...knownSources, ...inventory.sources, ...sources])].sort();
    if (inventory.complete) config.sourceFingerprint = inventory.fingerprint;
    else delete config.sourceFingerprint;
    if (full) config.lastFullSyncAt = config.lastSyncAt;
    await writeConfig(config);
  } catch (error) {
    await snapshotRequest(config, "fail", { runId, failureCode: error instanceof Error ? error.message.slice(0, 80) : "sync_failed" }).catch(() => undefined);
    throw error;
  }
  if (json) process.stdout.write(`${JSON.stringify(result)}\n`);
  else {
    process.stdout.write(partitions.length || sessions.length
      ? `Reconciled ${result.accepted} changed usage row(s) and ${sessions.length} session identifier(s) from ${sources.join(", ") || "local agents"}${full ? " across retained history" : ""}.\n`
      : `Already up to date. No usage rows changed${full ? " after a full-history reconciliation" : ""}.\n`);
    if (regressions.length) process.stdout.write(`${regressions.length} local row(s) moved backward and were submitted as authoritative corrections.\n`);
    if (explain) process.stdout.write(`Coverage ${result.coverage}; ${sources.length} source(s); ${days[0] || "unknown"} to ${days.at(-1) || "unknown"}; ${partitions.length} atomic partition(s).\n`);
  }
  return result;
}

async function status() {
  const config = await readConfig();
  if (!config) {
    process.stdout.write("Not linked. Open https://usagemax.com/account to connect this computer.\n");
    return;
  }
  const stableId = await stableInstallationId(configDirectory(), config.deviceId);
  if (config.deviceId !== stableId) {
    config.deviceId = stableId;
    await writeConfig(config);
  }
  process.stdout.write(`Linked: ${config.deviceName || deviceLabel()}${config.profileHandle ? ` → @${config.profileHandle}` : ""}\n`);
  process.stdout.write(`Last sync: ${config.lastSyncAt || "never"}\n`);
  process.stdout.write(`Last full reconciliation: ${config.lastFullSyncAt || "never"}\n`);
  process.stdout.write(`Profile: ${config.profileUrl || "https://usagemax.com/account"}\n`);
}

async function doctor(args = []) {
  const config = await readConfig();
  const env = await ccusageEnvironment();
  const inventory = await sourceInventory({ env, home: ccusageHome(env) });
  const archives = await discoverProviderArchives({ env, home: ccusageHome(env) });
  const homes = String(env.USAGEMAX_DISCOVERED_HOMES || ccusageHome(env)).split(",").filter(Boolean);
  const result = {
    linked: Boolean(config),
    homes,
    detectedSources: inventory.sources,
    files: inventory.files,
    inventoryComplete: inventory.complete,
    inventoryErrors: inventory.errors,
    inventoryTruncated: inventory.truncated,
    supportedSources: SUPPORTED_SOURCES,
    archives: archives.length,
    environment: platform() === "linux" && process.env.WSL_DISTRO_NAME ? `WSL ${process.env.WSL_DISTRO_NAME}` : platform(),
    mode: args.includes("--deep") ? "deep" : "metadata-only",
  };
  if (args.includes("--deep")) {
    const report = await ccusageJson(config, { env, full: true });
    result.parsedSources = sourceSummary(report);
    result.sessions = buildSessionPlan(report, config?.deviceId || "unlinked").length;
  }
  if (args.includes("--json")) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  process.stdout.write(`Collector: ${config ? "linked" : "not linked"}\n`);
  process.stdout.write(`Discovered homes: ${homes.length} (${homes.join(", ")})\n`);
  process.stdout.write(`Detected sources: ${inventory.sources.join(", ") || "none"} (${inventory.files}${inventory.truncated ? "+" : ""} data files)\n`);
  process.stdout.write(`Supported sources: ${SUPPORTED_SOURCES.join(", ")} (+ named pi-format stores)\n`);
  if (platform() === "linux" && process.env.WSL_DISTRO_NAME) {
    process.stdout.write(`Environment: WSL ${process.env.WSL_DISTRO_NAME}; readable Windows provider homes are included automatically\n`);
  }
  if (archives.length) process.stdout.write(`Recovery: ${archives.length} compressed provider archive(s) detected; run \`bunx usagemax sync --archives\` once to reconcile them\n`);
  if (!inventory.complete) process.stdout.write(`Inventory: incomplete (${inventory.errors} read error(s)${inventory.truncated ? ", file limit reached" : ""}); no-change shortcut disabled\n`);
  if (result.parsedSources) process.stdout.write(`Parsed sources: ${result.parsedSources.join(", ") || "none"}; ${result.sessions} private session identifiers\n`);
  process.stdout.write(`Mode: one-shot, metadata no-op check, ${args.includes("--deep") ? "deep local parse" : "no log parsing"}\n`);
}

async function report(args) {
  const forwarded = args.length ? args : ["daily"];
  const child = spawn(process.execPath, [ccusageCliPath(), ...forwarded], {
    stdio: "inherit",
    env: await ccusageEnvironment(),
  });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (status) => resolve(status ?? 1));
  });
  if (code !== 0) process.exitCode = code;
}

async function removeLink(args = []) {
  const path = configPath();
  const config = await readConfig();
  if (!config) {
    process.stdout.write("This computer is not linked.\n");
    return;
  }
  if (args.includes("--revoke")) {
    const endpoint = validHttpsUrl(config.revokeUrl, { allowLocalhost: true });
    if (!endpoint) throw new Error("This collector does not have a valid revoke endpoint. Revoke it at https://usagemax.com/account.");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json" },
      body: JSON.stringify({ deviceId: config.deviceId }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error("UsageMax could not revoke this collector. It remains linked locally.");
  }
  await unlink(path);
  process.stdout.write(args.includes("--revoke")
    ? "Revoked this collector and removed its local key. Existing usage totals were retained.\n"
    : "Removed the local UsageMax collector key. This computer's private installation identity was retained so relinking cannot duplicate its usage. Revoke the collector in your account if this computer is no longer trusted.\n");
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "sync";
  if (["--help", "-h", "help"].includes(command)) return help();
  if (["--version", "-v"].includes(command)) return process.stdout.write(`${VERSION}\n`);
  if (command === "link") return link(args.slice(1));
  if (command === "sync") return sync(args.slice(1));
  if (command === "status") return status();
  if (command === "doctor") return doctor(args.slice(1));
  if (command === "report") return report(args.slice(1));
  if (command === "unlink") return removeLink(args.slice(1));
  throw new Error(`Unknown command: ${command}. Run usagemax --help.`);
}

main().catch((error) => {
  process.stderr.write(`UsageMax: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
