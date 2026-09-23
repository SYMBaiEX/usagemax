import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const CCUSAGE_VERSION = "20.0.24";
// Reconcile retained history when the collector output contract changes, not
// just when a source path is added. v4 enables explicit per-model breakdowns.
export const SOURCE_INVENTORY_VERSION = 4;
export const LARGE_JSONL_WARNING_BYTES = 64 * 1024 * 1024;
export const SUPPORTED_SOURCES = [
  "amp",
  "claude",
  "codebuff",
  "codex",
  "copilot",
  "droid",
  "gemini",
  "goose",
  "grok",
  "hermes",
  "kilo",
  "kimi",
  "openclaw",
  "opencode",
  "pi",
  "qwen",
];

const MAX_FINGERPRINT_FILES = 50_000;
const WINDOWS_SYSTEM_PROFILES = /^(?:all users|default(?: user)?|defaultuser0|public|temp(?:\.|$)|umfd-)/i;
const BACKUP_DIRECTORY = /(?:claude|codex).*(?:backup|archive|old|copy|mirror)|(?:backup|archive|old|copy|mirror).*(?:claude|codex)|superclaude/i;
const ARCHIVE_EXTENSION = /(?:\.tar(?:\.gz)?|\.tgz|\.zip|\.7z)$/i;
const ARCHIVE_FILE = /(?:claude|codex).*(?:\.tar(?:\.gz)?|\.tgz|\.zip|\.7z)$/i;

function has(env, name) {
  return Object.prototype.hasOwnProperty.call(env, name);
}

function commaList(value) {
  return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

function envList(env, name, fallback, { blankUsesFallback = false } = {}) {
  if (!has(env, name) || (blankUsesFallback && !String(env[name] ?? "").trim())) return fallback;
  return commaList(env[name]);
}

function expandTilde(value, home, pathApi) {
  if (value === "~") return home;
  if (value.startsWith("~/") || value.startsWith("~\\")) return pathApi.join(home, value.slice(2));
  return value;
}

function uniquePaths(values, pathApi) {
  const seen = new Set();
  return values.filter((value) => {
    if (typeof value !== "string" || !value.trim()) return false;
    const normalized = pathApi.normalize(value.trim());
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

async function entries(value) {
  try {
    return await readdir(value, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function providerBearingHome(home, pathApi) {
  // Only inspect known provider roots. Avoid treating generic profile folders
  // (for example .local/share itself) as evidence that a Windows profile is
  // relevant; that would make multi-user WSL selection noisy and unsafe.
  const markers = [
    ".claude", ".config/claude", ".codex", ".factory", ".gemini", ".openclaw", ".clawdbot", ".moltbot", ".moldbot", ".hermes", ".grok",
    ".kimi", ".kimi-code", ".qwen", ".copilot", ".pi",
    ".local/share/amp", ".local/share/goose", ".local/share/Block/goose", ".local/share/kilo", ".local/share/opencode",
    "AppData/Roaming/Block/goose",
    ".config/manicode", ".config/manicode-dev", ".config/manicode-staging",
  ];
  const checks = await Promise.all(markers.map((marker) => existsDirectory(pathApi.join(home, marker))));
  return checks.some(Boolean);
}

export async function discoverWslWindowsHomeStatus({ env = process.env, platform = process.platform, pathApi = path } = {}) {
  if (platform !== "linux" || !String(env.WSL_DISTRO_NAME ?? "").trim()) {
    return { status: "not-applicable", candidates: [], selected: [] };
  }
  const usersRoot = String(env.USAGEMAX_WSL_USERS_DIR ?? "/mnt/c/Users").trim();
  const candidates = [];
  for (const entry of await entries(usersRoot)) {
    if (!entry.isDirectory() || WINDOWS_SYSTEM_PROFILES.test(entry.name)) continue;
    const candidate = pathApi.join(usersRoot, entry.name);
    if (await providerBearingHome(candidate, pathApi)) candidates.push(candidate);
  }
  // A WSL distro can see every Windows profile. Auto-select only when there is
  // one unambiguous provider-bearing profile; multi-user systems opt in with
  // USAGEMAX_ADDITIONAL_HOME so one employee never absorbs another's usage.
  const status = candidates.length === 1 ? "discovered" : candidates.length > 1 ? "ambiguous" : "unavailable";
  return { status, candidates, selected: status === "discovered" ? candidates : [] };
}

async function discoverBackupRoots(home, pathApi) {
  const claude = [];
  const codex = [];
  const containers = [
    { path: home, requireProviderName: true },
    { path: pathApi.join(home, ".claude", "backups"), requireProviderName: false },
    { path: pathApi.join(home, ".codex", "backups"), requireProviderName: false },
  ];
  for (const container of containers) {
    for (const entry of await entries(container.path)) {
      if (!entry.isDirectory() || (container.requireProviderName && !BACKUP_DIRECTORY.test(entry.name))) continue;
      const candidate = pathApi.join(container.path, entry.name);
      const claudeRoots = [candidate, pathApi.join(candidate, ".claude"), pathApi.join(candidate, "config")];
      for (const root of claudeRoots) {
        if (await existsDirectory(pathApi.join(root, "projects"))) claude.push(root);
      }
      const codexRoots = [candidate, pathApi.join(candidate, ".codex")];
      for (const root of codexRoots) {
        if (await existsDirectory(pathApi.join(root, "sessions")) || await existsDirectory(pathApi.join(root, "archived_sessions"))) codex.push(root);
      }
    }
  }
  return { claude, codex };
}

async function discoverNestedClaudeRoots(home, pathApi, maxDirectories = 4_096) {
  const bases = [
    pathApi.join(home, "Library", "Application Support", "Claude", "local-agent-mode-sessions"),
    pathApi.join(home, "AppData", "Roaming", "Claude", "local-agent-mode-sessions"),
  ];
  const roots = [];
  for (const base of bases) {
    if (!await existsDirectory(base)) continue;
    const stack = [{ directory: base, depth: 0 }];
    let visited = 0;
    while (stack.length && visited < maxDirectories) {
      const { directory, depth } = stack.pop();
      visited += 1;
      for (const entry of await entries(directory)) {
        if (!entry.isDirectory() || entry.name === "node_modules" || entry.name === ".git") continue;
        const child = pathApi.join(directory, entry.name);
        if (entry.name === ".claude") {
          if (await existsDirectory(pathApi.join(child, "projects"))) roots.push(child);
        } else if (depth < 7) {
          stack.push({ directory: child, depth: depth + 1 });
        }
      }
    }
  }
  return roots;
}

function setDiscoveredList(effective, name, defaults, additions, pathApi) {
  if (has(effective, name) && !String(effective[name] ?? "").trim()) return;
  const configured = has(effective, name) ? commaList(effective[name]) : defaults;
  effective[name] = uniquePaths([...configured, ...additions], pathApi).join(",");
}

export async function discoverProviderArchives({ env = process.env, home = ccusageHome(env), pathApi = path } = {}) {
  const homes = uniquePaths([home, ...commaList(env.USAGEMAX_DISCOVERED_HOMES), ...commaList(env.USAGEMAX_ADDITIONAL_HOME)], pathApi);
  const archives = [];
  for (const candidateHome of homes) {
    const roots = [
      { path: candidateHome, source: null },
      { path: pathApi.join(candidateHome, ".claude", "backups"), source: "claude" },
      { path: pathApi.join(candidateHome, ".codex", "backups"), source: "codex" },
    ];
    for (const root of roots) {
      for (const entry of await entries(root.path)) {
        if (!entry.isFile() || !ARCHIVE_EXTENSION.test(entry.name) || (!root.source && !ARCHIVE_FILE.test(entry.name))) continue;
        const filePath = pathApi.join(root.path, entry.name);
        try {
          const metadata = await stat(filePath);
          archives.push({ path: filePath, size: metadata.size, source: root.source || (/codex/i.test(entry.name) ? "codex" : "claude") });
        } catch {}
      }
    }
  }
  return archives.filter((archive, index) => archives.findIndex((item) => item.path === archive.path) === index);
}

export function ccusageHome(env = process.env, fallback = homedir()) {
  for (const value of [env.HOME, env.USERPROFILE]) {
    if (typeof value === "string" && value.trim()) return value;
  }
  const windowsHome = `${env.HOMEDRIVE ?? ""}${env.HOMEPATH ?? ""}`;
  return windowsHome.trim() || fallback;
}

function tree(source, root, matcher) {
  return { source, path: root, kind: "tree", matcher };
}

function file(source, filePath) {
  return { source, path: filePath, kind: "file", matcher: "any" };
}

function db(source, filePath) {
  return [file(source, filePath), file(source, `${filePath}-wal`), file(source, `${filePath}-shm`)];
}

export function sourceDefinitions({ env = process.env, home = ccusageHome(env), cwd = process.cwd(), pathApi = path } = {}) {
  const join = (...parts) => pathApi.join(...parts);
  const definitions = [];

  const claudeRoots = has(env, "CLAUDE_CONFIG_DIR")
    ? commaList(env.CLAUDE_CONFIG_DIR).map((item) => expandTilde(item, home, pathApi))
    : [join(has(env, "XDG_CONFIG_HOME") ? String(env.XDG_CONFIG_HOME) : join(home, ".config"), "claude"), join(home, ".claude")];
  for (const root of claudeRoots) {
    const projects = pathApi.basename(root) === "projects" ? root : join(root, "projects");
    definitions.push(tree("claude", projects, "jsonl"));
  }

  for (const root of envList(env, "CODEX_HOME", [join(home, ".codex")])) {
    definitions.push({ source: "codex", path: root, kind: "codex-home", matcher: "jsonl" });
  }
  for (const root of envList(env, "OPENCODE_DATA_DIR", [join(home, ".local", "share", "opencode")])) {
    definitions.push(tree("opencode", root, "opencode"));
  }
  for (const root of envList(env, "AMP_DATA_DIR", [join(home, ".local", "share", "amp")])) {
    definitions.push(tree("amp", join(root, "threads"), "json"));
  }
  for (const root of envList(env, "DROID_SESSIONS_DIR", [join(home, ".factory", "sessions")])) {
    definitions.push(tree("droid", root, "droid"));
  }

  const codebuffRoots = has(env, "CODEBUFF_DATA_DIR")
    ? commaList(env.CODEBUFF_DATA_DIR)
    : ["manicode", "manicode-dev", "manicode-staging"].map((channel) => join(home, ".config", channel));
  for (const root of codebuffRoots) {
    definitions.push(tree("codebuff", pathApi.basename(root) === "projects" ? root : join(root, "projects"), "codebuff"));
  }

  for (const root of envList(env, "HERMES_HOME", [join(home, ".hermes")])) {
    definitions.push(...db("hermes", join(root, "state.db")));
  }
  for (const root of envList(env, "PI_AGENT_DIR", [join(home, ".pi", "agent", "sessions")], { blankUsesFallback: true })) {
    definitions.push(tree("pi", root, "jsonl"));
  }

  const gooseRoots = envList(env, "GOOSE_PATH_ROOT", []);
  const gooseDatabases = gooseRoots.length
    ? gooseRoots.map((root) => join(root, "data", "sessions", "sessions.db"))
    : [
        join(home, ".local", "share", "goose", "sessions", "sessions.db"),
        join(home, "Library", "Application Support", "goose", "sessions", "sessions.db"),
        join(home, ".local", "share", "Block", "goose", "sessions", "sessions.db"),
      ];
  if (!gooseRoots.length && String(env.APPDATA ?? "").trim()) {
    gooseDatabases.push(join(String(env.APPDATA).trim(), "Block", "goose", "data", "sessions", "sessions.db"));
  }
  for (const database of gooseDatabases) definitions.push(...db("goose", database));

  const openClawRoots = envList(env, "OPENCLAW_DIR", [
    join(home, ".openclaw"),
    join(home, ".clawdbot"),
    join(home, ".moltbot"),
    join(home, ".moldbot"),
  ], { blankUsesFallback: true });
  for (const root of openClawRoots) definitions.push(tree("openclaw", root, "openclaw"));

  for (const root of envList(env, "KILO_DATA_DIR", [join(home, ".local", "share", "kilo")])) {
    definitions.push(...db("kilo", join(root, "kilo.db")));
  }
  for (const root of envList(env, "KIMI_DATA_DIR", [join(home, ".kimi"), join(home, ".kimi-code")])) {
    definitions.push(tree("kimi", join(root, "sessions"), "jsonl"), file("kimi", join(root, "config.json")));
  }
  for (const root of envList(env, "QWEN_DATA_DIR", [join(home, ".qwen")])) {
    definitions.push(tree("qwen", join(root, "projects"), "jsonl"));
  }

  for (const root of envList(env, "COPILOT_OTEL_DIR", [join(home, ".copilot", "otel")])) {
    definitions.push(tree("copilot", root, "jsonl"));
  }
  if (String(env.COPILOT_OTEL_FILE_EXPORTER_PATH ?? "").trim()) {
    definitions.push(file("copilot", String(env.COPILOT_OTEL_FILE_EXPORTER_PATH).trim()));
  }
  for (const root of envList(env, "GEMINI_DATA_DIR", [join(home, ".gemini", "tmp")])) {
    definitions.push(tree("gemini", root, "gemini"));
  }
  const grokRoot = String(env.GROK_HOME ?? "").trim() || join(home, ".grok");
  definitions.push(tree("grok", join(grokRoot, "sessions"), "grok"));

  const configRoots = has(env, "CLAUDE_CONFIG_DIR")
    ? commaList(env.CLAUDE_CONFIG_DIR)
    : [join(home, ".config", "claude"), join(home, ".claude")];
  const configPaths = [join(cwd, ".ccusage", "ccusage.json"), ...configRoots.map((root) => join(root, "ccusage.json"))];
  for (const configPath of configPaths) definitions.push(file("ccusage-config", configPath));

  return definitions;
}

export async function ccusageEnvironment({ env = process.env, platform = process.platform, pathApi = path } = {}) {
  const effective = { ...env };
  const home = ccusageHome(effective);
  const configuredHomes = commaList(effective.USAGEMAX_ADDITIONAL_HOME).map((item) => expandTilde(item, home, pathApi));
  const wslDiscovery = await discoverWslWindowsHomeStatus({ env: effective, platform, pathApi });
  const wslHomes = wslDiscovery.selected;
  const additionalHomes = uniquePaths([...configuredHomes, ...wslHomes], pathApi).filter((item) => pathApi.normalize(item) !== pathApi.normalize(home));
  const discoveredWindowsGooseRoots = [];
  if (platform === "linux" && String(effective.WSL_DISTRO_NAME ?? "").trim()) {
    for (const candidate of additionalHomes) {
      const root = pathApi.join(candidate, "AppData", "Roaming", "Block", "goose");
      if (await existsDirectory(root)) discoveredWindowsGooseRoots.push(root);
    }
  }
  if (discoveredWindowsGooseRoots.length) {
    const explicitRoots = commaList(effective.GOOSE_PATH_ROOT);
    const defaultRoots = [
      pathApi.join(home, ".local", "share", "goose"),
      pathApi.join(home, "Library", "Application Support", "goose"),
      pathApi.join(home, ".local", "share", "Block", "goose"),
      ...(String(effective.APPDATA ?? "").trim() ? [pathApi.join(String(effective.APPDATA).trim(), "Block", "goose")] : []),
    ];
    effective.GOOSE_PATH_ROOT = uniquePaths([
      ...(explicitRoots.length ? explicitRoots : defaultRoots),
      ...discoveredWindowsGooseRoots,
    ], pathApi).join(",");
  }
  const homes = [home, ...additionalHomes];
  const backups = await Promise.all(homes.map((candidate) => discoverBackupRoots(candidate, pathApi)));
  const nestedClaude = (await Promise.all(homes.map((candidate) => discoverNestedClaudeRoots(candidate, pathApi)))).flat();
  const mirroredClaude = [];
  for (const candidate of homes) {
    const mirror = pathApi.join(candidate, ".cc-mirror", "mclaude", "config");
    if (await existsDirectory(pathApi.join(mirror, "projects"))) mirroredClaude.push(mirror);
  }

  const xdgClaude = pathApi.join(has(effective, "XDG_CONFIG_HOME") ? String(effective.XDG_CONFIG_HOME) : pathApi.join(home, ".config"), "claude");
  setDiscoveredList(effective, "CLAUDE_CONFIG_DIR", [xdgClaude, pathApi.join(home, ".claude")], [
    ...additionalHomes.flatMap((candidate) => [pathApi.join(candidate, ".config", "claude"), pathApi.join(candidate, ".claude")]),
    ...mirroredClaude,
    ...backups.flatMap((item) => item.claude),
    ...nestedClaude,
  ], pathApi);
  setDiscoveredList(effective, "CODEX_HOME", [pathApi.join(home, ".codex")], [
    ...additionalHomes.map((candidate) => pathApi.join(candidate, ".codex")),
    ...backups.flatMap((item) => item.codex),
  ], pathApi);

  const additions = (segments) => additionalHomes.map((candidate) => pathApi.join(candidate, ...segments));
  setDiscoveredList(effective, "OPENCODE_DATA_DIR", [pathApi.join(home, ".local", "share", "opencode")], additions([".local", "share", "opencode"]), pathApi);
  setDiscoveredList(effective, "AMP_DATA_DIR", [pathApi.join(home, ".local", "share", "amp")], additions([".local", "share", "amp"]), pathApi);
  setDiscoveredList(effective, "DROID_SESSIONS_DIR", [pathApi.join(home, ".factory", "sessions")], additions([".factory", "sessions"]), pathApi);
  setDiscoveredList(effective, "CODEBUFF_DATA_DIR", ["manicode", "manicode-dev", "manicode-staging"].map((channel) => pathApi.join(home, ".config", channel)), additionalHomes.flatMap((candidate) => ["manicode", "manicode-dev", "manicode-staging"].map((channel) => pathApi.join(candidate, ".config", channel))), pathApi);
  setDiscoveredList(effective, "HERMES_HOME", [pathApi.join(home, ".hermes")], additions([".hermes"]), pathApi);
  setDiscoveredList(effective, "PI_AGENT_DIR", [pathApi.join(home, ".pi", "agent", "sessions")], additions([".pi", "agent", "sessions"]), pathApi);
  setDiscoveredList(effective, "OPENCLAW_DIR", [".openclaw", ".clawdbot", ".moltbot", ".moldbot"].map((name) => pathApi.join(home, name)), additionalHomes.flatMap((candidate) => [".openclaw", ".clawdbot", ".moltbot", ".moldbot"].map((name) => pathApi.join(candidate, name))), pathApi);
  setDiscoveredList(effective, "KILO_DATA_DIR", [pathApi.join(home, ".local", "share", "kilo")], additions([".local", "share", "kilo"]), pathApi);
  setDiscoveredList(effective, "KIMI_DATA_DIR", [pathApi.join(home, ".kimi"), pathApi.join(home, ".kimi-code")], additionalHomes.flatMap((candidate) => [pathApi.join(candidate, ".kimi"), pathApi.join(candidate, ".kimi-code")]), pathApi);
  setDiscoveredList(effective, "QWEN_DATA_DIR", [pathApi.join(home, ".qwen")], additions([".qwen"]), pathApi);
  setDiscoveredList(effective, "GEMINI_DATA_DIR", [pathApi.join(home, ".gemini", "tmp")], additions([".gemini", "tmp"]), pathApi);
  setDiscoveredList(effective, "COPILOT_OTEL_DIR", [pathApi.join(home, ".copilot", "otel")], additions([".copilot", "otel"]), pathApi);

  effective.USAGEMAX_DISCOVERED_HOMES = homes.join(",");

  if (platform === "win32" && !String(effective.GOOSE_PATH_ROOT ?? "").trim() && String(effective.APPDATA ?? "").trim()) {
    const gooseRoot = pathApi.join(String(effective.APPDATA).trim(), "Block", "goose");
    try {
      if ((await stat(pathApi.join(gooseRoot, "data", "sessions", "sessions.db"))).isFile()) effective.GOOSE_PATH_ROOT = gooseRoot;
    } catch {}
  }
  return effective;
}

function accepts(matcher, filePath, pathApi) {
  const name = pathApi.basename(filePath);
  if (matcher === "any") return true;
  if (matcher === "jsonl") return name.endsWith(".jsonl");
  if (matcher === "json") return name.endsWith(".json");
  if (matcher === "gemini") return name.endsWith(".json") || name.endsWith(".jsonl");
  if (matcher === "codebuff") return name === "chat-messages.json";
  if (matcher === "droid") return name.endsWith(".settings.json") || name.endsWith(".jsonl");
  if (matcher === "openclaw") return name.includes(".jsonl");
  if (matcher === "grok") return name === "updates.jsonl" || name === "summary.json";
  if (matcher === "opencode") return name.endsWith(".db") || name.includes(".db-") || name.endsWith(".json");
  return false;
}

async function existsDirectory(value) {
  try {
    return (await stat(value)).isDirectory();
  } catch {
    return false;
  }
}

async function expandCodexRoots(definitions, pathApi) {
  const expanded = [];
  for (const definition of definitions) {
    if (definition.kind !== "codex-home") {
      expanded.push(definition);
      continue;
    }
    const sessions = pathApi.join(definition.path, "sessions");
    const archived = pathApi.join(definition.path, "archived_sessions");
    const [hasSessions, hasArchived] = await Promise.all([existsDirectory(sessions), existsDirectory(archived)]);
    if (hasSessions) expanded.push(tree("codex", sessions, "jsonl"));
    if (hasArchived) expanded.push(tree("codex", archived, "jsonl"));
    if (!hasSessions && !hasArchived) expanded.push(tree("codex", definition.path, "jsonl"));
  }
  return expanded;
}

function configCandidates(definitions) {
  return definitions.filter((item) => item.source === "ccusage-config").map((item) => item.path);
}

async function namedPiStores(definitions, home, pathApi) {
  for (const configPath of configCandidates(definitions)) {
    try {
      const parsed = JSON.parse(await readFile(configPath, "utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
      const stores = Array.isArray(parsed.pi?.stores) ? parsed.pi.stores : [];
      return stores.flatMap((store) => {
        if (!store || typeof store.name !== "string" || typeof store.path !== "string" || !store.path.trim()) return [];
        return [tree(store.name.trim().toLowerCase(), expandTilde(store.path.trim(), home, pathApi), "jsonl")];
      });
    } catch {}
  }
  return [];
}

function fileIdentity(source, filePath, metadata) {
  return `${source}\u0000${filePath}\u0000${metadata.size}\u0000${metadata.mtimeMs}\u0000${metadata.ctimeMs}\n`;
}

export async function sourceInventory({ env = process.env, cwd = process.cwd(), home = ccusageHome(env), pathApi = path, maxFiles = MAX_FINGERPRINT_FILES } = {}) {
  const hash = createHash("sha256");
  hash.update(`inventory:${SOURCE_INVENTORY_VERSION}\nccusage:${CCUSAGE_VERSION}\naliases:${env.CCUSAGE_MODEL_ALIASES ?? ""}\n`);
  let definitions = sourceDefinitions({ env, cwd, home, pathApi });
  definitions.push(...await namedPiStores(definitions, home, pathApi));
  definitions = await expandCodexRoots(definitions, pathApi);
  definitions.sort((left, right) => `${left.source}\u0000${left.path}`.localeCompare(`${right.source}\u0000${right.path}`));

  const sources = new Set();
  const seenRoots = new Set();
  const seenFiles = new Set();
  let files = 0;
  let truncated = false;
  let complete = true;
  let errors = 0;
  const largeJsonlBySource = new Map();

  async function addFile(definition, filePath) {
    const identity = `${definition.source}\u0000${filePath}`;
    if (seenFiles.has(identity)) return;
    if (files >= maxFiles) {
      truncated = true;
      complete = false;
      return;
    }
    try {
      const metadata = await stat(filePath);
      if (!metadata.isFile()) return;
      seenFiles.add(identity);
      hash.update(fileIdentity(definition.source, filePath, metadata));
      if (filePath.toLowerCase().endsWith(".jsonl") && metadata.size >= LARGE_JSONL_WARNING_BYTES) {
        const stats = largeJsonlBySource.get(definition.source) ?? { source: definition.source, count: 0, bytes: 0 };
        stats.count += 1;
        stats.bytes += metadata.size;
        largeJsonlBySource.set(definition.source, stats);
      }
      if (definition.source === "ccusage-config") {
        try {
          hash.update(await readFile(filePath));
        } catch {
          complete = false;
          errors += 1;
        }
      } else {
        sources.add(definition.source);
      }
      files += 1;
    } catch (error) {
      if (error?.code !== "ENOENT") {
        complete = false;
        errors += 1;
      }
    }
  }

  for (const definition of definitions) {
    const rootIdentity = `${definition.source}\u0000${definition.kind}\u0000${definition.path}`;
    if (seenRoots.has(rootIdentity)) continue;
    seenRoots.add(rootIdentity);
    hash.update(`root:${rootIdentity}\n`);
    if (definition.kind === "file") {
      await addFile(definition, definition.path);
      continue;
    }
    let rootMetadata;
    try {
      rootMetadata = await stat(definition.path);
    } catch (error) {
      if (error?.code !== "ENOENT") {
        complete = false;
        errors += 1;
      }
      continue;
    }
    if (!rootMetadata.isDirectory()) continue;
    const stack = [definition.path];
    while (stack.length && !truncated) {
      const current = stack.pop();
      let entries;
      try {
        entries = await readdir(current, { withFileTypes: true });
      } catch {
        complete = false;
        errors += 1;
        continue;
      }
      entries.sort((left, right) => left.name.localeCompare(right.name));
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];
        const filePath = pathApi.join(current, entry.name);
        if (entry.isDirectory()) stack.push(filePath);
        else if (entry.isFile() && accepts(definition.matcher, filePath, pathApi)) await addFile(definition, filePath);
        if (truncated) break;
      }
    }
  }

  return {
    complete,
    errors,
    files,
    fingerprint: hash.digest("hex"),
    sources: [...sources].sort(),
    largeJsonlFiles: {
      thresholdBytes: LARGE_JSONL_WARNING_BYTES,
      count: [...largeJsonlBySource.values()].reduce((sum, stats) => sum + stats.count, 0),
      bytes: [...largeJsonlBySource.values()].reduce((sum, stats) => sum + stats.bytes, 0),
      bySource: [...largeJsonlBySource.values()].sort((left, right) => left.source.localeCompare(right.source)),
    },
    supportedSources: SUPPORTED_SOURCES,
    truncated,
    version: SOURCE_INVENTORY_VERSION,
  };
}
