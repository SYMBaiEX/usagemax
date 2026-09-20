import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";

export const REGISTRY_URL = "https://registry.npmjs.org/usagemax/latest";
export const UPDATE_CHECK_TTL_MS = 12 * 60 * 60 * 1000;

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}

export function compareVersions(left, right) {
  const a = String(left || "").split(".").map(Number);
  const b = String(right || "").split(".").map(Number);
  if (a.length !== 3 || b.length !== 3 || a.some((part) => !Number.isInteger(part)) || b.some((part) => !Number.isInteger(part))) return 0;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

function cachePath(directory) {
  return join(directory, "update-check.json");
}

async function readCache(directory) {
  try {
    const value = record(JSON.parse(await readFile(cachePath(directory), "utf8")));
    if (!value || !Number.isFinite(value.checkedAt)) return null;
    return value;
  } catch {
    return null;
  }
}

async function writeCache(directory, value) {
  await mkdir(dirname(cachePath(directory)), { recursive: true, mode: 0o700 });
  const path = cachePath(directory);
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

export async function latestVersion({ fetchImpl = fetch, timeout = 1_500 } = {}) {
  try {
    const response = await fetchImpl(REGISTRY_URL, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) return null;
    const body = record(await response.json());
    return /^\d+\.\d+\.\d+$/.test(body?.version || "") ? body.version : null;
  } catch {
    return null;
  }
}

/**
 * Check npm at most twice a day. A failed check is deliberately non-fatal.
 * The result contains no account data and is safe to cache locally.
 */
export async function checkForUpdate(directory, currentVersion, { force = false, now = Date.now(), fetchImpl = fetch } = {}) {
  const cached = await readCache(directory);
  if (!force && cached && now - cached.checkedAt < UPDATE_CHECK_TTL_MS) {
    return { ...cached, newer: compareVersions(cached.latest, currentVersion) > 0 };
  }
  const latest = await latestVersion({ fetchImpl });
  const result = { checkedAt: now, latest: latest || cached?.latest || null };
  await writeCache(directory, result).catch(() => undefined);
  return { ...result, newer: compareVersions(result.latest, currentVersion) > 0 };
}

function runner() {
  const override = process.env.USAGEMAX_PACKAGE_RUNNER?.trim();
  if (override) return { command: override, prefix: [] };
  if (process.env.npm_execpath) return { command: "npm", prefix: ["exec", "--yes"] };
  return { command: "bunx", prefix: ["--bun"] };
}

/** Re-run a command through the current npm dist-tag without requiring @latest. */
export async function runLatest(args, { spawnImpl = spawn } = {}) {
  const selected = runner();
  const child = spawnImpl(selected.command, [...selected.prefix, "usagemax@latest", "--", ...args], {
    stdio: "inherit",
    env: { ...process.env, USAGEMAX_UPDATE_HANDOFF: "1" },
  });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (status) => resolve(status ?? 1));
  });
  process.exitCode = code;
  return code;
}
