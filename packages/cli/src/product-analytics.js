import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { open, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { withConfigLock } from "./resume.js";

const ENDPOINT = "https://usagemax.com/api/v1/cli-analytics";
const TIMEOUT_MS = 650;
const STATE_FILE = "settings.json";
const MAX_STATE_BYTES = 1024;
const HEX = /^[0-9a-f]{64}$/;
const VERSION = /^(?:0|[1-9][0-9]{0,5})\.(?:0|[1-9][0-9]{0,5})\.(?:0|[1-9][0-9]{0,5})$/;
const NOTICE = "UsageMax CLI telemetry is on. It shares your CLI version, OS, architecture, and a daily rotating ID. Run `usagemax telemetry disable` to opt out. https://docs.usagemax.com/cli-analytics\n";

function analyticsDirectory(directory) {
  return join(directory, "cli-analytics");
}

function validDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function validateState(state) {
  if (!state || state.version !== 1 || typeof state.enabled !== "boolean") return null;
  if (Object.keys(state).some((key) => !["version", "enabled", "seed", "lastAttemptDay"].includes(key))) return null;
  if (state.seed !== undefined && (!state.enabled || typeof state.seed !== "string" || !HEX.test(state.seed))) return null;
  if (state.lastAttemptDay !== undefined && !validDay(state.lastAttemptDay)) return null;
  return state;
}

// undefined means no preference yet, while null means the settings failed validation.
async function readState(directory) {
  let handle;
  try {
    const flags = constants.O_RDONLY | (constants.O_NONBLOCK ?? 0) | (constants.O_NOFOLLOW ?? 0);
    handle = await open(join(directory, STATE_FILE), flags);
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.size > MAX_STATE_BYTES) return null;
    const bytes = Buffer.alloc(MAX_STATE_BYTES + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead > MAX_STATE_BYTES) return null;
    return validateState(JSON.parse(bytes.toString("utf8", 0, bytesRead)));
  } catch (error) {
    return error?.code === "ENOENT" ? undefined : null;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function saveState(directory, state) {
  const temporary = join(directory, `.settings.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(state)}\n`, { flag: "wx", mode: 0o600 });
    await rename(temporary, join(directory, STATE_FILE));
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

function environmentOptOut(env) {
  if (env.DO_NOT_TRACK === "1") return "DO_NOT_TRACK";
  if (env.USAGEMAX_TELEMETRY_DISABLED === "1") return "USAGEMAX_TELEMETRY_DISABLED";
  if (env.CI && !["0", "false"].includes(env.CI.toLowerCase())) return "CI";
  return null;
}

function statusFor(state, env) {
  const preference = state === null ? "unavailable" : state === undefined ? "default" : state.enabled ? "enabled" : "disabled";
  const disabledBy = environmentOptOut(env) ?? (preference === "unavailable" ? "settings_unavailable" : preference === "disabled" ? "preference" : null);
  return { enabled: disabledBy === null, preference, disabledBy };
}

export async function productAnalyticsStatus(directory, env = process.env) {
  return statusFor(await readState(analyticsDirectory(directory)), env);
}

export async function setProductAnalyticsEnabled(directory, enabled, env = process.env) {
  const settingsDirectory = analyticsDirectory(directory);
  return withConfigLock(settingsDirectory, async () => {
    const previous = await readState(settingsDirectory);
    const state = {
      version: 1,
      enabled,
      ...(enabled && previous?.seed ? { seed: previous.seed } : {}),
      ...(previous?.lastAttemptDay ? { lastAttemptDay: previous.lastAttemptDay } : {}),
    };
    await saveState(settingsDirectory, state);
    return statusFor(state, env);
  });
}

function shouldAttempt(state, day) {
  return state !== null && state?.enabled !== false && (!state?.lastAttemptDay || state.lastAttemptDay < day);
}

export async function recordProductAnalytics(directory, {
  command, args, cliVersion, env = process.env, now = new Date(),
  stdin = process.stdin, stdout = process.stdout, stderr = process.stderr,
}) {
  if (!["link", "sync", "doctor"].includes(command)
    || args.some((arg) => ["--json", "--quiet", "--no-progress", "--dry-run", "--help", "-h", "--version", "-v"].includes(arg))
    || !stdin.isTTY || !stdout.isTTY || !stderr.isTTY
    || environmentOptOut(env)
    || !VERSION.test(cliVersion)) return;

  const settingsDirectory = analyticsDirectory(directory);
  try {
    const day = now.toISOString().slice(0, 10);
    if (!shouldAttempt(await readState(settingsDirectory), day)) return;
    await withConfigLock(settingsDirectory, async () => {
      const previous = await readState(settingsDirectory);
      if (!shouldAttempt(previous, day)) return;
      const seed = previous?.seed ?? randomBytes(32).toString("hex");
      if (!previous?.seed) stderr.write(NOTICE);
      // Reserve the attempt before the request. A timeout or rejection never causes a retry.
      await saveState(settingsDirectory, { version: 1, enabled: true, seed, lastAttemptDay: day });
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "omit",
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        body: JSON.stringify({
          schemaVersion: 1,
          day,
          dailyId: createHmac("sha256", Buffer.from(seed, "hex")).update(day).digest("hex"),
          cliVersion,
          platform: ["darwin", "linux", "win32"].includes(process.platform) ? process.platform : "other",
          arch: ["x64", "arm64"].includes(process.arch) ? process.arch : "other",
        }),
      });
      void response.body?.cancel().catch(() => undefined);
    });
  } catch {
    // Product telemetry must never make a successful collector operation fail.
  }
}
