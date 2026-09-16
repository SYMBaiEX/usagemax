import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, chmod, copyFile, mkdir, readFile, readdir, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const ENV_KEYS = ["PATH", "XDG_CONFIG_HOME", "APPDATA", "LOCALAPPDATA", "WSL_DISTRO_NAME", "CLAUDE_CONFIG_DIR", "CODEX_HOME", "OPENCODE_DATA_DIR", "AMP_DATA_DIR", "DROID_SESSIONS_DIR", "CODEBUFF_DATA_DIR", "HERMES_HOME", "PI_AGENT_DIR", "GOOSE_PATH_ROOT", "OPENCLAW_DIR", "KILO_DATA_DIR", "KIMI_DATA_DIR", "QWEN_DATA_DIR", "GEMINI_DATA_DIR", "GROK_HOME", "COPILOT_OTEL_FILE_EXPORTER_PATH", "USAGEMAX_ADDITIONAL_HOME", "USAGEMAX_WSL_USERS_DIR", "CCUSAGE_MODEL_ALIASES"];
const xml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
const unitQuote = (value) => `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("%", "%%").replaceAll("$", () => "$$")}"`;
const windowsQuote = (value) => `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, "$1$1")}"`;

export function intervalMinutes(value = 15) {
  if (!/^\d+$/.test(String(value)) || Number(value) < 5 || Number(value) > 1440) throw new Error("--every must be an integer from 5 to 1440 minutes.");
  return Number(value);
}

export function capturedEnvironment(env) {
  // Never persist the whole shell environment: it can contain provider secrets.
  return Object.fromEntries(ENV_KEYS.filter((key) => typeof env[key] === "string").map((key) => [key, env[key]]));
}

export function assertDurablePath(path) {
  if (!isAbsolute(path) || /[\x00-\x1f]/.test(path) || /\/(?:_npx|cache|fnm_multishells)\//i.test(path.replaceAll("\\", "/"))) {
    throw new Error("Automatic sync needs a persistent installation. Run `bun install -g usagemax`, then `usagemax service install`; do not install a scheduler from bunx/npx caches.");
  }
}

export function brandedRuntimePath(directory, platform = process.platform) {
  if (platform !== "darwin" && platform !== "win32") return null;
  return platform === "win32"
    ? join(directory, "runtime", "UsageMax.exe")
    : join(directory, "runtime", "bin", "UsageMax");
}

/**
 * Give scheduled jobs a stable product-facing image name on platforms where
 * the JavaScript runtime otherwise appears as `node` in process browsers.
 * The copied runtime is intentionally private to this installation and is
 * refreshed on every service install, so upgrading Node or UsageMax never
 * leaves the scheduler pointing at an ephemeral cache path.
 */
export async function ensureBrandedRuntime(directory, executable, platform = process.platform) {
  const target = brandedRuntimePath(directory, platform);
  if (!target) return executable;
  const source = await realpath(executable);
  const runtimeBinDirectory = dirname(target);
  if (source === target) return target;
  await mkdir(runtimeBinDirectory, { recursive: true, mode: 0o700 });
  const temporary = join(runtimeBinDirectory, `.${platform === "win32" ? "UsageMax.exe" : "UsageMax"}.${randomUUID()}.tmp`);
  try {
    await copyFile(source, temporary);
    if (platform !== "win32") await chmod(temporary, 0o700);
    await rename(temporary, target);
    if (platform === "darwin") {
      // Homebrew Node uses @rpath/libnode.<n>.dylib next to its bin folder;
      // the official Node distribution is self-contained. Copy only adjacent
      // dylibs when they exist, keeping both layouts runnable.
      const sourceLibraryDirectory = resolve(dirname(source), "../lib");
      const runtimeLibraryDirectory = resolve(runtimeBinDirectory, "../lib");
      const sourceLibraries = await readdir(sourceLibraryDirectory, { withFileTypes: true }).catch((error) => {
        if (error?.code === "ENOENT") return [];
        throw error;
      });
      const libraries = sourceLibraries.filter((entry) => entry.isFile() && entry.name.endsWith(".dylib"));
      if (libraries.length) await mkdir(runtimeLibraryDirectory, { recursive: true, mode: 0o700 });
      for (const library of libraries) {
        const libraryTemporary = join(runtimeLibraryDirectory, `.${library.name}.${randomUUID()}.tmp`);
        try {
          await copyFile(join(sourceLibraryDirectory, library.name), libraryTemporary);
          await chmod(libraryTemporary, 0o700);
          await rename(libraryTemporary, join(runtimeLibraryDirectory, library.name));
        } finally {
          await unlink(libraryTemporary).catch(() => undefined);
        }
      }
    }
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
  return target;
}

export function servicePlan({ directory, executable, cli, minutes = 15, platform = process.platform, home = homedir(), uid = process.getuid?.(), configHome = join(home, ".config"), now = Date.now() }) {
  minutes = intervalMinutes(minutes);
  for (const path of [directory, executable, cli, home, configHome]) if (/[\x00-\x1f]/.test(path)) throw new Error("Scheduler paths cannot contain control characters.");
  const id = createHash("sha256").update(directory).digest("hex").slice(0, 12);
  const name = `com.UsageMax.sync.${id}`;
  const args = [cli, "service", "run", "--config-dir", directory];
  // Linux can execute the published shebang entry point directly. macOS and
  // Windows launch the staged UsageMax runtime so process browsers do not show
  // the generic JavaScript runtime image name.
  const command = platform === "win32" || platform === "darwin"
    ? [executable, ...args]
    : [cli, "service", "run", "--config-dir", directory];
  if (platform === "darwin") {
    const file = join(home, "Library", "LaunchAgents", `${name}.plist`);
    const domain = `gui/${uid}`;
    return { backend: "launchd", name, files: [[file, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>Label</key><string>${name}</string>
<key>ProgramArguments</key><array>${command.map((s) => `<string>${xml(s)}</string>`).join("")}</array>
<key>WorkingDirectory</key><string>${xml(home)}</string>
<key>StartInterval</key><integer>${minutes * 60 + parseInt(id.slice(0, 4), 16) % 60}</integer>
<key>ProcessType</key><string>Background</string><key>Nice</key><integer>10</integer>
<key>LowPriorityIO</key><true/><key>StandardOutPath</key><string>/dev/null</string>
<key>StandardErrorPath</key><string>/dev/null</string></dict></plist>
`]], probe: ["launchctl", ["print", `${domain}/${name}`]], install: [["launchctl", ["bootstrap", domain, file]], ["launchctl", ["enable", `${domain}/${name}`]]], uninstall: [["launchctl", ["bootout", `${domain}/${name}`]]] };
  }
  if (platform === "linux") {
    const root = join(configHome, "systemd", "user");
    return { backend: "systemd", name, files: [
      [join(root, `${name}.service`), `[Unit]\nDescription=UsageMax incremental usage sync\n[Service]\nType=oneshot\nExecStart=${command.map(unitQuote).join(" ")}\nWorkingDirectory=${unitQuote(home)}\nNice=10\nIOSchedulingClass=idle\nTimeoutStartSec=infinity\nStandardOutput=null\nStandardError=null\n`],
      [join(root, `${name}.timer`), `[Unit]\nDescription=UsageMax automatic sync\n[Timer]\nOnActiveSec=1m\nOnUnitInactiveSec=${minutes}m\nRandomizedDelaySec=60\nAccuracySec=30s\n[Install]\nWantedBy=timers.target\n`],
    ], probe: ["systemctl", ["--user", "is-active", `${name}.timer`]], install: [["systemctl", ["--user", "daemon-reload"]], ["systemctl", ["--user", "enable", "--now", `${name}.timer`]]], uninstall: [["systemctl", ["--user", "disable", "--now", `${name}.timer`]]] };
  }
  if (platform === "win32") {
    const file = join(directory, "service-task.xml");
    return { backend: "task-scheduler", name, files: [[file, `<?xml version="1.0" encoding="UTF-8"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
<Triggers><TimeTrigger><Repetition><Interval>PT${minutes}M</Interval><StopAtDurationEnd>false</StopAtDurationEnd></Repetition><StartBoundary>${new Date(now + 60000).toISOString()}</StartBoundary><Enabled>true</Enabled><RandomDelay>PT1M</RandomDelay></TimeTrigger></Triggers>
<Principals><Principal id="Author"><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
<Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>true</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><StartWhenAvailable>true</StartWhenAvailable><Enabled>true</Enabled><WakeToRun>false</WakeToRun><ExecutionTimeLimit>PT0S</ExecutionTimeLimit><Priority>7</Priority></Settings>
<Actions Context="Author"><Exec><Command>${xml(executable)}</Command><Arguments>${xml(args.map(windowsQuote).join(" "))}</Arguments><WorkingDirectory>${xml(home)}</WorkingDirectory></Exec></Actions></Task>
`]], probe: ["schtasks.exe", ["/Query", "/TN", name, "/XML"]], install: [["schtasks.exe", ["/Create", "/TN", name, "/XML", file, "/F"]]], uninstall: [["schtasks.exe", ["/Delete", "/TN", name, "/F"]]] };
  }
  throw new Error("Automatic sync supports macOS, Windows, and Linux with a user systemd manager (including running WSL distributions).");
}

async function readJson(path) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function atomicWrite(path, content) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, content, { mode: 0o600, flag: "wx" });
    await rename(temp, path);
  } finally { await unlink(temp).catch(() => {}); }
}

const runCommand = ([command, args]) => execute(command, args, { timeout: 15000, maxBuffer: 256 * 1024, windowsHide: true });

export async function manageService(action, { directory, cli, minutes, env = process.env, executeCommand = runCommand, home = homedir(), platform = process.platform }) {
  directory = resolve(directory);
  const settingsPath = join(directory, "service.json");
  const settings = await readJson(settingsPath);
  const configHome = settings?.configHome || env.XDG_CONFIG_HOME || join(home, ".config");
  const executable = brandedRuntimePath(directory, platform) || process.execPath;
  const plan = servicePlan({ directory, cli, executable, minutes: minutes ?? settings?.minutes ?? 15, configHome, home, platform });
  if (action === "status") {
    let registered = false;
    try { await executeCommand(plan.probe); registered = true; } catch { /* Not installed, inactive, or unavailable. */ }
    return { installed: Boolean(settings), schedulerReachable: registered, backend: plan.backend, minutes: settings?.minutes ?? null, lastRun: await readJson(join(directory, "service-state.json")), hint: registered ? "Check lastRun for sync health. Windows task registration does not prove it is enabled." : "Scheduler is not active/reachable. On WSL, start the distro and enable its systemd user manager." };
  }
  if (action === "uninstall") {
    if (!settings) return { installed: false };
    // Failure is surfaced: do not claim removal while a scheduler might still run.
    for (const command of plan.uninstall) await executeCommand(command);
    for (const [file] of plan.files) await unlink(file).catch((error) => { if (error.code !== "ENOENT") throw error; });
    await unlink(settingsPath);
    if (plan.backend === "systemd") await executeCommand(["systemctl", ["--user", "daemon-reload"]]);
    return { installed: false, retained: "Account link, usage checkpoints, and last-run status retained. An in-flight sync may finish." };
  }
  if (action !== "install") throw new Error("Use service install [--every 15], status, run, or uninstall.");
  assertDurablePath(await realpath(cli));
  if (platform === "darwin" || platform === "win32") assertDurablePath(await realpath(process.execPath));
  await access(join(directory, "config.json"));
  if (platform === "darwin" || platform === "win32") await ensureBrandedRuntime(directory, process.execPath, platform);
  // Check the user manager before writing anything. WSL without systemd fails clearly.
  if (plan.backend === "systemd") await executeCommand(["systemctl", ["--user", "show-environment"]]);
  if (settings) {
    let registered = false;
    try { await executeCommand(plan.probe); registered = true; } catch { /* Missing registration can be repaired. */ }
    if (registered) for (const command of plan.uninstall) await executeCommand(command);
  }
  const next = { version: 1, minutes: intervalMinutes(minutes ?? settings?.minutes ?? 15), configHome, env: capturedEnvironment(env), installedAt: new Date().toISOString() };
  await atomicWrite(settingsPath, JSON.stringify(next));
  for (const [file, content] of plan.files) await atomicWrite(file, content);
  try {
    for (const command of plan.install) await executeCommand(command);
    await executeCommand(plan.probe);
  } catch (error) {
    throw new Error("Scheduler registration failed. Settings were retained for repair; rerun service install or check service status.", { cause: error });
  }
  return { installed: true, backend: plan.backend, minutes: next.minutes, note: "Opt-in one-shot jobs; no daemon, auto-updater, or wake-from-sleep. Reinstall after moving/upgrading the CLI or changing source paths." };
}

export async function runScheduledSync(directory, action, { now = () => Date.now(), env = process.env } = {}) {
  const settings = await readJson(join(directory, "service.json"));
  if (!settings) return { status: "disabled" };
  const path = join(directory, "service-state.json");
  const previous = await readJson(path) || {};
  if (previous.nextAttemptAt > now()) return { status: "backoff", nextAttemptAt: previous.nextAttemptAt };
  Object.assign(env, capturedEnvironment(settings.env || {}));
  const start = now();
  let state;
  try {
    await action();
    state = { status: "ok", failures: 0, lastSuccessAt: new Date(now()).toISOString() };
  } catch (error) {
    if (error.code === "USAGEMAX_BUSY") return { status: "busy" };
    const failures = Math.min((previous.failures || 0) + 1, 10);
    // Save no command output, tokens, paths, or raw server error bodies.
    state = { status: "error", failures, lastSuccessAt: previous.lastSuccessAt ?? null, nextAttemptAt: now() + Math.min(6 * 60, settings.minutes * 2 ** failures) * 60000, hint: "Run usagemax sync manually to diagnose; checkpoints are preserved." };
  }
  state = { ...state, attemptedAt: new Date(start).toISOString(), durationMs: now() - start };
  await atomicWrite(path, JSON.stringify(state));
  return state;
}
