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

/** Parse the read-only and command-handoff options shared by `usagemax update`. */
export function updateRequest(args = []) {
  const json = args.includes("--json");
  const checkOnly = args.includes("--check") || args.includes("--no-install");
  const commandArgs = args.filter((arg) => !["--check", "--no-install", "--json"].includes(arg));
  return {
    json,
    checkOnly,
    commandArgs,
    handoffArgs: commandArgs.length && !checkOnly ? [...commandArgs, ...(json ? ["--json"] : [])] : [],
  };
}

/** A command suffix runs only after a usable npm release was confirmed. */
export function updateCommandWillRun({ latest, checkOnly, commandArgs = [] }) {
  return Boolean(latest && !checkOnly && commandArgs.length);
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

function runner({ manager, env = process.env, platform = process.platform }) {
  const override = env.USAGEMAX_PACKAGE_RUNNER?.trim();
  if (override) return { command: override, prefix: [] };
  if (manager === "bun") return { command: platform === "win32" ? "bunx.exe" : "bunx", prefix: ["--bun"] };
  return { command: platform === "win32" ? "npm.cmd" : "npm", prefix: ["exec", "--yes"] };
}

/**
 * Pick the package manager that owns the current invocation. Bun's global and
 * ephemeral package paths are explicit; npm remains the safe default for a
 * normal Node installation. The override is useful for managed environments
 * where the executable is wrapped by a fleet-specific package manager.
 */
export function packageManagerFor({ cliPath = process.argv[1], runtime = process.versions, env = process.env } = {}) {
  const override = String(env.USAGEMAX_PACKAGE_MANAGER || "").trim().toLowerCase();
  if (override === "bun" || override === "npm") return override;
  const normalizedPath = String(cliPath || "").replaceAll("\\", "/");
  if (normalizedPath.includes("/.bun/install/") || runtime?.bun) return "bun";
  if (env.npm_execpath || String(env.npm_config_user_agent || "").startsWith("npm/")) return "npm";
  return "npm";
}

/** Install the current public release into the user's global package scope. */
export async function updateGlobal({ latest = "latest", manager = packageManagerFor(), spawnImpl = spawn, env = process.env, quiet = false, platform = process.platform } = {}) {
  if (manager !== "bun" && manager !== "npm") throw new Error(`Unsupported package manager: ${manager}`);
  if (!/^\d+\.\d+\.\d+$/.test(String(latest)) && latest !== "latest") throw new Error("Invalid UsageMax release version.");
  const command = manager === "bun" ? (platform === "win32" ? "bun.exe" : "bun") : (platform === "win32" ? "npm.cmd" : "npm");
  const args = manager === "bun"
    ? ["add", "--global", `usagemax@${latest}`]
    : ["install", "--global", `usagemax@${latest}`];
  const child = spawnImpl(command, args, {
    // Do not leave child output pipes undrained: a JSON-mode package update
    // can otherwise block once Bun/npm fills the operating-system pipe buffer.
    stdio: quiet ? "ignore" : "inherit",
    env: { ...env, NPM_CONFIG_UPDATE_NOTIFIER: "false" },
  });
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (status) => {
      const code = status ?? 1;
      if (code === 0) resolve({ manager, command, args });
      else reject(Object.assign(new Error(`${command} ${args.join(" ")} exited with code ${code}.`), { code: "USAGEMAX_UPDATE_FAILED", exitCode: code }));
    });
  });
}

/** Re-run a command through the current npm dist-tag without requiring @latest. */
export async function runLatest(args, {
  spawnImpl = spawn,
  cliPath = process.argv[1],
  runtime = process.versions,
  env = process.env,
  platform = process.platform,
} = {}) {
  const manager = packageManagerFor({ cliPath, runtime, env });
  const selected = runner({ manager, env, platform });
  const child = spawnImpl(selected.command, [...selected.prefix, "usagemax@latest", "--", ...args], {
    stdio: "inherit",
    env: { ...env, USAGEMAX_UPDATE_HANDOFF: "1" },
  });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (status) => resolve(status ?? 1));
  });
  process.exitCode = code;
  return code;
}
