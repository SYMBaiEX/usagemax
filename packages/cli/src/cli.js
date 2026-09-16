#!/usr/bin/env node

import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { prepareArchiveRecovery } from "./archives.js";
import { buildSessionPlan, buildSnapshotPlan, normalizeLinkCode, reportDateArgs, scanPolicy, sourceSummary, validHttpsUrl } from "./core.js";
import { stableInstallationId } from "./installation.js";
import { intervalMinutes, manageService, runScheduledSync } from "./service.js";
import { collectorStatusView, requestCollectorStatus, requestSnapshot } from "./transport.js";
import { resumeUpload, restartExpiredUpload, withConfigLock } from "./resume.js";
import { CCUSAGE_VERSION, ccusageEnvironment, ccusageHome, discoverProviderArchives, SOURCE_INVENTORY_VERSION, sourceInventory, SUPPORTED_SOURCES } from "./sources.js";

// Make the short-lived collector recognizable in Activity Monitor and `ps`.
// Windows may still display the underlying node.exe image name in Task Manager.
process.title = "UsageMax";

const require = createRequire(import.meta.url);
const executeFile = promisify(execFile);
const VERSION = "0.3.6";
const PUBLIC_API_ORIGIN = "https://usagemax.com/api";
const DEFAULT_LINK_ENDPOINT = `${PUBLIC_API_ORIGIN}/v1/devices/link`;
const DEFAULT_STATUS_ENDPOINT = `${PUBLIC_API_ORIGIN}/v1/devices/status`;
const CONFIG_FILE = "config.json";
const MAX_REPORT_BYTES = 100 * 1024 * 1024;
const TOKEN_PATTERN = /^umx_[a-f0-9]{64}$/;
const DEVICE_PATTERN = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

function configDirectory() {
  if (process.env.USAGEMAX_CONFIG_DIR) return process.env.USAGEMAX_CONFIG_DIR;
  if (platform() === "win32") return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "UsageMax");
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "usagemax");
}

function configPath() {
  return join(configDirectory(), CONFIG_FILE);
}

function isLegacyDirectApi(config) {
  try {
    const ingest = new URL(config.ingestUrl);
    const profile = new URL(config.profileUrl || "https://usagemax.com");
    return profile.hostname === "usagemax.com"
      && ingest.hostname.endsWith(".convex.site")
      && ingest.pathname === "/v1/telemetry/llm";
  } catch {
    return false;
  }
}

async function readConfig() {
  try {
    const parsed = JSON.parse(await readFile(configPath(), "utf8"));
    if (!parsed || parsed.version !== 1 || !TOKEN_PATTERN.test(parsed.token || "")) return null;
    if (!validHttpsUrl(parsed.ingestUrl, { allowLocalhost: true })) return null;
    if (typeof parsed.deviceId !== "string" || !parsed.deviceId) return null;
    parsed.snapshots = parsed.snapshots && typeof parsed.snapshots === "object" ? parsed.snapshots : {};
    if (isLegacyDirectApi(parsed)) {
      parsed.ingestUrl = `${PUBLIC_API_ORIGIN}/v1/telemetry/llm`;
      parsed.snapshotUrl = `${PUBLIC_API_ORIGIN}/v2/usage/snapshots`;
      parsed.statusUrl = `${PUBLIC_API_ORIGIN}/v1/devices/status`;
      parsed.revokeUrl = `${PUBLIC_API_ORIGIN}/v1/devices/revoke`;
      await writeConfig(parsed);
    }
    parsed.snapshotUrl = validHttpsUrl(parsed.snapshotUrl, { allowLocalhost: true })
      || parsed.ingestUrl.replace(/\/v1\/telemetry\/llm$/, "/v2/usage/snapshots");
    parsed.statusUrl = validHttpsUrl(parsed.statusUrl, { allowLocalhost: true })
      || parsed.ingestUrl.replace(/\/v1\/telemetry\/llm$/, "/v1/devices/status");
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
  process.stdout.write("  usagemax sync [--full] [--archives] [--restart] [--dry-run] [--explain] [--json]\n");
  process.stdout.write("                                  Reconcile once; --archives performs one-time recovery\n");
  process.stdout.write("  usagemax status                  Show local link status\n");
  process.stdout.write("           --remote [--json]        Verify the stored collector credential without printing it\n");
  process.stdout.write("  usagemax token status [--device-id <uuid>] [--json]\n");
  process.stdout.write("                                  Diagnose a key piped on stdin; never pass it as an argument\n");
  process.stdout.write("  usagemax service install [--every 15]\n");
  process.stdout.write("                                  Opt into lightweight OS-scheduled sync\n");
  process.stdout.write("  usagemax service status|run|uninstall\n");
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
  args.push(...reportDateArgs(config, { full }));
  const { stdout } = await executeFile(process.execPath, args, {
    encoding: "utf8",
    maxBuffer: MAX_REPORT_BYTES,
    timeout: 10 * 60 * 1000,
    killSignal: "SIGKILL",
    env: { ...(env || await ccusageEnvironment()), NO_COLOR: "1" },
  });
  return JSON.parse(stdout);
}

function snapshotEndpoint(config) {
  return validHttpsUrl(config.snapshotUrl, { allowLocalhost: true })
    || config.ingestUrl.replace(/\/v1\/telemetry\/llm$/, "/v2/usage/snapshots");
}

async function snapshotRequest(config, operation, payload, timeout = 30_000) {
  return requestSnapshot(snapshotEndpoint(config), config, operation, payload, { timeout });
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
  const requestedName = option(args, "--name");
  const name = requestedName?.trim().slice(0, 80) || undefined;
  const previous = await readConfig();
  const deviceId = await stableInstallationId(configDirectory(), previous?.deviceId);
  const headers = { "content-type": "application/json" };
  if (previous?.token) headers.authorization = `Bearer ${previous.token}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ code, ...(name ? { name, nameExplicit: true } : {}), platform: platform(), cliVersion: VERSION, deviceId }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error === "invalid_or_expired_link_code" ? "That link code is invalid, expired, or already used." : "UsageMax could not link this computer.");
  const ingestUrl = validHttpsUrl(body.ingestUrl, { allowLocalhost: true });
  const snapshotUrl = validHttpsUrl(body.snapshotUrl, { allowLocalhost: true }) || ingestUrl?.replace(/\/v1\/telemetry\/llm$/, "/v2/usage/snapshots");
  const statusUrl = validHttpsUrl(body.statusUrl, { allowLocalhost: true }) || ingestUrl?.replace(/\/v1\/telemetry\/llm$/, "/v1/devices/status");
  const revokeUrl = validHttpsUrl(body.revokeUrl, { allowLocalhost: true }) || ingestUrl?.replace(/\/v1\/telemetry\/llm$/, "/v1/devices/revoke");
  if (!TOKEN_PATTERN.test(body.token || "") || !ingestUrl || !snapshotUrl || !statusUrl || !revokeUrl) throw new Error("UsageMax returned an invalid link response.");
  const profileHandle = typeof body.profileHandle === "string" ? body.profileHandle : undefined;
  const savedName = typeof body.deviceName === "string" && body.deviceName.trim() ? body.deviceName.trim().slice(0, 80) : (name || deviceLabel());
  const sameAccount = Boolean(previous && previous.profileHandle && previous.profileHandle === profileHandle);
  const config = {
    version: 1,
    token: body.token,
    ingestUrl,
    snapshotUrl,
    statusUrl,
    revokeUrl,
    profileUrl: validHttpsUrl(body.profileUrl) || "https://usagemax.com/account",
    profileHandle,
    deviceId,
    deviceName: savedName,
    linkedAt: new Date().toISOString(),
    snapshots: sameAccount ? previous.snapshots : {},
  };
  await writeConfig(config);
  warnVersion(body);
  process.stdout.write(`Linked ${savedName} to ${config.profileHandle ? `@${config.profileHandle}` : "UsageMax"}.\n`);
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
  if (args.includes("--restart") && !dryRun) {
    restartExpiredUpload(config);
    await writeConfig(config);
  }
  if (config.pendingSync) {
    if (dryRun) {
      const result = { ...config.pendingSync.result, dryRun: true, pendingRunId: config.pendingSync.runId };
      process.stdout.write(json ? `${JSON.stringify(result)}\n` : `Dry run: saved run ${config.pendingSync.runId} awaits resume; no upload.\n`);
      return result;
    }
    const result = await resumeUpload(config, { save: writeConfig, request: snapshotRequest, warn: warnVersion });
    process.stdout.write(json ? `${JSON.stringify(result)}\n` : "Resumed and completed the saved sync. Run sync again to scan newer local changes.\n");
    return result;
  }
  const inventory = await sourceInventory({ env: recovery.env, home: ccusageHome(recovery.env) });
  const today = new Date().toISOString().slice(0, 10);
  const knownSources = Array.isArray(config.knownSources) ? config.knownSources : [];
  const { bootstrap, full, skip, inventoryStable } = scanPolicy(config, inventory, {
    today, now: Date.now(), inventoryVersion: SOURCE_INVENTORY_VERSION, requestedFull, requestedArchives,
  });
  if (skip) {
    const result = { accepted: 0, changedRows: 0, sessions: 0, sources: inventory.sources, corrections: 0, scanned: false, full: false, coverage: config.lastCoverage || "partial" };
    if (json) process.stdout.write(`${JSON.stringify(result)}\n`);
    else process.stdout.write("Already up to date. Local usage files have not changed; no logs were parsed or uploaded.\n");
    return;
  }
  const report = await ccusageJson(config, { env: recovery.env, full });
  // ccusage v20 exposes aggregates, not proof that every discovered file was
  // parsed. Inventory success alone cannot authorize destructive corrections.
  const authoritative = false;
  const legacySnapshotBootstrap = bootstrap
    && Object.keys(config.snapshots || {}).length > 0;
  const runId = randomUUID();
  const revision = Date.now();
  const pricingVersion = `ccusage@${CCUSAGE_VERSION}`;
  const { partitions, nextSnapshots, regressions } = buildSnapshotPlan(report, config.snapshots, {
    bootstrap,
    complete: authoritative,
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
    accepted: null,
    changedRows: partitions.reduce((sum, partition) => sum + partition.rows.filter((row) => JSON.stringify(row.previous) !== JSON.stringify(row.current)).length, 0),
    sessions: sessions.length,
    sources,
    corrections: authoritative ? regressions.length : 0,
    protectedRegressions: authoritative ? 0 : regressions.length,
    partitions: partitions.length,
    scanned: true,
    full,
    coverage: authoritative ? "complete" : "partial",
    coverageReason: "Parser does not certify complete source/day coverage; decreases and deletions are protected.",
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
      if (explain) process.stdout.write(`Coverage ${result.coverage}; ${sources.length} source(s); ${days[0] || "unknown"} to ${days.at(-1) || "unknown"}; ${regressions.length} protected regression(s). ${result.coverageReason}\n`);
    }
    return result;
  }
  const requests = [{ operation: "begin", payload: {
      runId,
      mode: requestedArchives ? "archives" : full ? "full" : "incremental",
      baselineMode: legacySnapshotBootstrap ? "adopt-current" : "apply",
      sourceCount: sources.length,
      partitionCount: partitions.length,
      inventoryComplete: authoritative,
      inventoryErrors: inventory.errors,
      inventoryTruncated: inventory.truncated,
      coverageStartDay: days[0],
      coverageEndDay: days.at(-1),
    } }];
  for (let offset = 0; offset < sessions.length; offset += 100) {
    requests.push({ operation: "sessions", payload: { runId, sessions: sessions.slice(offset, offset + 100) } });
  }
  for (let offset = 0; offset < partitions.length; offset += 10) {
    requests.push({ operation: "partitions", payload: { runId, partitions: partitions.slice(offset, offset + 10) } });
  }
  requests.push({ operation: "complete", payload: { runId } });
  const syncedAt = new Date().toISOString();
  config.pendingSync = {
    version: 1, runId, cursor: 0, requests, result,
    checkpoint: {
      snapshots: nextSnapshots, snapshotProtocolVersion: 2,
      lastSyncAt: syncedAt, lastReconciledDay: today, lastSyncComplete: authoritative,
      lastScanSucceeded: true, lastCoverage: result.coverage,
      sourceInventoryVersion: SOURCE_INVENTORY_VERSION,
      knownSources: [...new Set([...knownSources, ...inventory.sources, ...sources])].sort(),
      sourceFingerprint: inventoryStable ? inventory.fingerprint : null,
      ...(full ? { lastFullSyncAt: syncedAt } : {}),
    },
  };
  config.lastSyncComplete = false;
  await writeConfig(config);
  await resumeUpload(config, { save: writeConfig, request: snapshotRequest, warn: warnVersion });
  if (json) process.stdout.write(`${JSON.stringify(result)}\n`);
  else {
    process.stdout.write(partitions.length || sessions.length
      ? `Completed ${partitions.length} usage chunk(s) and ${sessions.length} session identifier(s) from ${sources.join(", ") || "local agents"}${full ? " across retained history" : ""}.\n`
      : `Already up to date. No usage rows changed${full ? " after a full-history reconciliation" : ""}.\n`);
    if (regressions.length) process.stdout.write(`${regressions.length} local row(s) moved backward; prior counter dimensions were preserved because coverage is incomplete.\n`);
    if (!authoritative) process.stdout.write(`${result.coverageReason}\n`);
    if (explain) process.stdout.write(`Coverage ${result.coverage}; ${sources.length} source(s); ${days[0] || "unknown"} to ${days.at(-1) || "unknown"}; ${partitions.length} atomic partition(s).\n`);
  }
  return result;
}

function collectorStatusEndpoint(config) {
  return validHttpsUrl(process.env.USAGEMAX_STATUS_ENDPOINT, { allowLocalhost: true })
    || validHttpsUrl(config.statusUrl, { allowLocalhost: true })
    || config.ingestUrl.replace(/\/v1\/telemetry\/llm$/, "/v1/devices/status");
}

function printRemoteStatus(view) {
  process.stdout.write(`Remote credential: ${view.status || "unavailable"}${view.httpStatus ? ` (HTTP ${view.httpStatus})` : ""}\n`);
  if (view.reason) process.stdout.write(`${view.reason}\n`);
  if (view.credentialType) process.stdout.write(`Type: ${view.credentialType}${view.writeOnly ? "; write-only" : ""}\n`);
  if (view.scopes?.length) process.stdout.write(`Scopes: ${view.scopes.join(", ")}\n`);
  if (view.deviceBinding) process.stdout.write(`Device binding: ${view.deviceBinding}\n`);
  if (view.profileHandle) process.stdout.write(`Profile: @${view.profileHandle}\n`);
  if (view.deviceName) process.stdout.write(`Computer: ${view.deviceName}\n`);
  if (view.platform || view.cliVersion) process.stdout.write(`Runtime: ${view.platform || "unknown"}${view.cliVersion ? ` · CLI ${view.cliVersion}` : ""}\n`);
  if (view.activation) process.stdout.write(`Activation: ${view.activation}\n`);
  if (view.expiresAt === null) process.stdout.write("Expiration: none\n");
  if (view.lastSuccessAt) process.stdout.write(`Last accepted write: ${new Date(view.lastSuccessAt).toISOString()}\n`);
  if (view.lastFailureAt) process.stdout.write(`Last rejected write: ${new Date(view.lastFailureAt).toISOString()}${view.lastFailureCode ? ` · ${view.lastFailureCode}` : ""}\n`);
}

async function status(args = []) {
  const config = await readConfig();
  const remote = args.includes("--remote");
  const json = args.includes("--json");
  if (!config) {
    if (json) {
      process.stdout.write(`${JSON.stringify({ linked: false, remote: remote ? { status: "not_linked" } : undefined })}\n`);
      return;
    }
    process.stdout.write("Not linked. Open https://usagemax.com/account to connect this computer.\n");
    return;
  }
  const stableId = await stableInstallationId(configDirectory(), config.deviceId);
  if (config.deviceId !== stableId) {
    config.deviceId = stableId;
    await writeConfig(config);
  }
  const local = {
    linked: true,
    deviceName: config.deviceName || deviceLabel(),
    profileHandle: config.profileHandle || null,
    deviceIdConfigured: Boolean(config.deviceId),
    lastSyncAt: config.lastSyncAt || null,
    lastFullSyncAt: config.lastFullSyncAt || null,
    pendingSync: config.pendingSync?.runId || null,
    profileUrl: config.profileUrl || "https://usagemax.com/account",
  };
  let remoteView;
  if (remote) {
    try {
      const result = await requestCollectorStatus(collectorStatusEndpoint(config), config);
      remoteView = collectorStatusView(result.httpStatus, result.body);
    } catch (error) {
      remoteView = { tokenFormat: "valid", status: "unavailable", reason: error instanceof Error ? error.message : "Collector status unavailable." };
    }
    if (json) {
      process.stdout.write(`${JSON.stringify({ ...local, remote: remoteView })}\n`);
      return;
    }
  }
  if (json) {
    process.stdout.write(`${JSON.stringify(local)}\n`);
    return;
  }
  process.stdout.write(`Linked: ${config.deviceName || deviceLabel()}${config.profileHandle ? ` → @${config.profileHandle}` : ""}\n`);
  process.stdout.write(`Last sync: ${config.lastSyncAt || "never"}\n`);
  process.stdout.write(`Last full reconciliation: ${config.lastFullSyncAt || "never"}\n`);
  if (config.pendingSync) process.stdout.write(`Pending sync: ${config.pendingSync.runId}; rerun sync to resume\n`);
  process.stdout.write(`Profile: ${config.profileUrl || "https://usagemax.com/account"}\n`);
  if (remote) printRemoteStatus(remoteView);
}

async function readTokenFromStdin() {
  if (process.stdin.isTTY) throw new Error("Pipe the collector token on stdin; never pass it as a command-line argument.");
  const token = (await readFile(0, "utf8")).trim();
  if (!TOKEN_PATTERN.test(token)) throw new Error("stdin did not contain a valid UsageMax collector token (expected umx_ plus 64 lowercase hexadecimal characters).");
  return token;
}

async function tokenStatus(args = []) {
  const requestedDeviceId = option(args, "--device-id");
  if (requestedDeviceId && !DEVICE_PATTERN.test(requestedDeviceId)) throw new Error("--device-id must be a UUID.");
  const token = await readTokenFromStdin();
  const configuredEndpoint = process.env.USAGEMAX_STATUS_ENDPOINT || DEFAULT_STATUS_ENDPOINT;
  const endpoint = validHttpsUrl(configuredEndpoint, { allowLocalhost: true });
  if (!endpoint) throw new Error("USAGEMAX_STATUS_ENDPOINT must use HTTPS, except for localhost development.");
  const result = await requestCollectorStatus(endpoint, { token, deviceId: requestedDeviceId });
  const view = collectorStatusView(result.httpStatus, result.body);
  if (args.includes("--json")) process.stdout.write(`${JSON.stringify(view)}\n`);
  else {
    process.stdout.write("Credential format: valid (umx_ + 64 lowercase hexadecimal characters)\n");
    printRemoteStatus(view);
  }
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
  if (command === "service") {
    const action = args[1] || "status";
    const directory = option(args, "--config-dir") || configDirectory();
    process.env.USAGEMAX_CONFIG_DIR = directory;
    let result;
    if (action === "run") {
      result = await runScheduledSync(directory, () => withConfigLock(directory, () => sync(["--json"])));
      if (result.status === "error") process.exitCode = 1;
    } else if (action === "status") {
      result = await manageService(action, { directory, cli: fileURLToPath(import.meta.url) });
    } else {
      result = await withConfigLock(directory, async () => {
        if (action === "install" && !await readConfig()) throw new Error("Link this computer before enabling automatic sync.");
        if (args.includes("--every") && option(args, "--every") === undefined) throw new Error("--every requires a number of minutes.");
        return manageService(action, { directory, cli: fileURLToPath(import.meta.url), minutes: args.includes("--every") ? intervalMinutes(option(args, "--every")) : undefined });
      });
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === "report") return report(args.slice(1));
  if (command === "token" && args[1] === "status") return tokenStatus(args.slice(2));
  if (["link", "sync", "status", "doctor", "unlink"].includes(command)) {
    return withConfigLock(configDirectory(), async () => {
      if (command === "link") return link(args.slice(1));
      if (command === "sync") return sync(args.slice(1));
      if (command === "status") return status(args.slice(1));
      if (command === "doctor") return doctor(args.slice(1));
      return removeLink(args.slice(1));
    });
  }
  throw new Error(`Unknown command: ${command}. Run usagemax --help.`);
}

main().catch((error) => {
  process.stderr.write(`UsageMax: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
