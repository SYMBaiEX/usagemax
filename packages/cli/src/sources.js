import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const CCUSAGE_VERSION = "20.0.20";
export const SOURCE_INVENTORY_VERSION = 2;
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

  const gooseRoot = String(env.GOOSE_PATH_ROOT ?? "").trim();
  const gooseDatabases = gooseRoot
    ? [join(gooseRoot, "data", "sessions", "sessions.db")]
    : [
        join(home, ".local", "share", "goose", "sessions", "sessions.db"),
        join(home, "Library", "Application Support", "goose", "sessions", "sessions.db"),
        join(home, ".local", "share", "Block", "goose", "sessions", "sessions.db"),
      ];
  if (!gooseRoot && String(env.APPDATA ?? "").trim()) {
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

  definitions.push(tree("copilot", join(home, ".copilot", "otel"), "jsonl"));
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
  if (platform !== "win32" || String(effective.GOOSE_PATH_ROOT ?? "").trim() || !String(effective.APPDATA ?? "").trim()) {
    return effective;
  }
  const gooseRoot = pathApi.join(String(effective.APPDATA).trim(), "Block", "goose");
  try {
    if ((await stat(pathApi.join(gooseRoot, "data", "sessions", "sessions.db"))).isFile()) effective.GOOSE_PATH_ROOT = gooseRoot;
  } catch {}
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
    supportedSources: SUPPORTED_SOURCES,
    truncated,
    version: SOURCE_INVENTORY_VERSION,
  };
}
