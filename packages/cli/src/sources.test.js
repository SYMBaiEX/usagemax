import assert from "node:assert/strict";
import { mkdtemp, mkdir, open, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { ccusageEnvironment, ccusageHome, discoverProviderArchives, discoverWslWindowsHomeStatus, LARGE_JSONL_WARNING_BYTES, sourceDefinitions, sourceInventory, SUPPORTED_SOURCES } from "./sources.js";

test("matches ccusage home precedence on Windows and POSIX", () => {
  assert.equal(ccusageHome({ HOME: "/linux", USERPROFILE: "C:\\Users\\me" }), "/linux");
  assert.equal(ccusageHome({ USERPROFILE: "C:\\Users\\me" }), "C:\\Users\\me");
  assert.equal(ccusageHome({ HOMEDRIVE: "D:", HOMEPATH: "\\Users\\me" }), "D:\\Users\\me");
});

test("resolves all 19 ccusage sources with Windows-safe paths", () => {
  const definitions = sourceDefinitions({ env: {}, home: "C:\\Users\\me", cwd: "C:\\work", pathApi: path.win32, platform: "win32" });
  const sources = [...new Set(definitions.filter((item) => item.source !== "ccusage-config").map((item) => item.source))].sort();
  assert.deepEqual(sources, [...SUPPORTED_SOURCES].sort());
  assert.ok(definitions.some((item) => item.path === "C:\\Users\\me\\.factory\\sessions"));
  assert.ok(definitions.some((item) => item.path === "C:\\Users\\me\\.hermes\\state.db"));
  assert.ok(definitions.some((item) => item.path === "C:\\Users\\me\\.copilot\\otel"));
  assert.ok(definitions.some((item) => item.source === "opencode" && item.path === "C:\\Users\\me\\.local\\share\\opencode"));
  assert.ok(definitions.some((item) => item.source === "cline" && item.path === "C:\\Users\\me\\AppData\\Roaming\\Code\\User\\globalStorage\\saoudrizwan.claude-dev"));
  assert.ok(definitions.some((item) => item.source === "antigravity" && item.path === "C:\\Users\\me\\.gemini\\antigravity\\conversations"));
  assert.ok(definitions.some((item) => item.source === "zcode" && item.path === "C:\\Users\\me\\.zcode\\cli\\db\\db.sqlite"));
});

test("discovers OpenCode from XDG_DATA_HOME and fingerprints Cline, Antigravity, and ZCode", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "usagemax-new-sources-"));
  const home = path.join(root, "home");
  const xdg = path.join(root, "xdg-data");
  const files = [
    path.join(xdg, "opencode", "storage", "message", "session-1", "msg_1.json"),
    path.join(home, ".cline", "data", "sessions", "session-1", "session-1.messages.json"),
    path.join(home, ".gemini", "antigravity", "conversations", "conversation.db"),
    path.join(home, ".zcode", "cli", "db", "db.sqlite"),
  ];
  for (const file of files) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, "data");
  }

  const env = { HOME: home, XDG_DATA_HOME: xdg };
  const inventory = await sourceInventory({ env, home, cwd: root });
  assert.deepEqual(inventory.sources, ["antigravity", "cline", "opencode", "zcode"]);
  const definitions = sourceDefinitions({ env, home, cwd: root });
  assert.ok(definitions.some((item) => item.source === "opencode" && item.path === path.join(xdg, "opencode")));
  assert.ok(definitions.some((item) => item.source === "antigravity" && item.path === path.join(home, ".gemini", "antigravity", "conversations")));
});

test("adds Cline editor storage roots for each supported operating system", async () => {
  const home = "C:\\Users\\me";
  const appData = "C:\\Users\\me\\AppData\\Roaming";
  const effective = await ccusageEnvironment({
    env: { HOME: home, APPDATA: appData },
    platform: "win32",
    pathApi: path.win32,
  });
  assert.ok(effective.CLINE_DATA_DIR.split(",").includes(path.win32.join(appData, "Code", "User", "globalStorage", "saoudrizwan.claude-dev")));
  assert.ok(effective.ANTIGRAVITY_DATA_DIR.split(",").includes(path.win32.join(home, ".config", "antigravity")));
  assert.ok(effective.ZCODE_HOME.split(",").includes(path.win32.join(home, ".zcode")));
});

test("uses comma-only overrides and Claude XDG discovery", () => {
  const env = {
    AMP_DATA_DIR: "/data/account:work,/data/two",
    XDG_CONFIG_HOME: "/xdg",
  };
  const definitions = sourceDefinitions({ env, home: "/home/me", cwd: "/work", pathApi: path.posix });
  assert.ok(definitions.some((item) => item.source === "amp" && item.path === "/data/account:work/threads"));
  assert.ok(definitions.some((item) => item.source === "amp" && item.path === "/data/two/threads"));
  assert.ok(definitions.some((item) => item.source === "claude" && item.path === "/xdg/claude/projects"));
});

test("adds the official Windows Goose database and configures ccusage when present", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "usagemax-goose-"));
  const appData = path.join(root, "AppData", "Roaming");
  const database = path.join(appData, "Block", "goose", "data", "sessions", "sessions.db");
  await mkdir(path.dirname(database), { recursive: true });
  await writeFile(database, "db");
  const definitions = sourceDefinitions({ env: { APPDATA: appData }, home: path.join(root, "home"), cwd: root });
  assert.ok(definitions.some((item) => item.source === "goose" && item.path === database));
  const effective = await ccusageEnvironment({ env: { APPDATA: appData }, platform: "win32" });
  assert.equal(effective.GOOSE_PATH_ROOT, path.join(appData, "Block", "goose"));
});

test("discovers readable Windows provider homes from WSL without scanning their whole profile", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "usagemax-wsl-"));
  const home = path.join(root, "linux-home");
  const users = path.join(root, "mnt", "c", "Users");
  const windowsHome = path.join(users, "austi");
  await mkdir(path.join(home, ".claude", "projects"), { recursive: true });
  await mkdir(path.join(windowsHome, ".claude", "projects"), { recursive: true });
  await mkdir(path.join(windowsHome, ".codex", "sessions"), { recursive: true });
  await writeFile(path.join(windowsHome, ".claude", "projects", "one.jsonl"), "{}\n");
  await writeFile(path.join(windowsHome, ".codex", "sessions", "one.jsonl"), "{}\n");

  const effective = await ccusageEnvironment({
    env: { HOME: home, USAGEMAX_WSL_USERS_DIR: users, WSL_DISTRO_NAME: "Ubuntu" },
    platform: "linux",
  });
  assert.ok(effective.CLAUDE_CONFIG_DIR.split(",").includes(path.join(windowsHome, ".claude")));
  assert.ok(effective.CODEX_HOME.split(",").includes(path.join(windowsHome, ".codex")));
  const inventory = await sourceInventory({ env: effective, home, cwd: root });
  assert.deepEqual(inventory.sources, ["claude", "codex"]);
});

test("discovers Windows homes containing only Kimi, Qwen, or Copilot data", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "usagemax-wsl-providers-"));
  const home = path.join(root, "linux-home");
  const users = path.join(root, "mnt", "c", "Users");
  const windowsHome = path.join(users, "austi");
  const providerFiles = [
    path.join(windowsHome, ".kimi", "sessions", "session.jsonl"),
    path.join(windowsHome, ".qwen", "projects", "project", "session.jsonl"),
    path.join(windowsHome, ".copilot", "otel", "events.jsonl"),
  ];
  for (const file of providerFiles) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, "{}\n");
  }

  const env = { HOME: home, USAGEMAX_WSL_USERS_DIR: users, WSL_DISTRO_NAME: "Ubuntu" };
  const discovery = await discoverWslWindowsHomeStatus({ env, platform: "linux" });
  assert.equal(discovery.status, "discovered");
  assert.deepEqual(discovery.selected, [windowsHome]);

  const effective = await ccusageEnvironment({ env, platform: "linux" });
  assert.ok(effective.KIMI_DATA_DIR.split(",").includes(path.join(windowsHome, ".kimi")));
  assert.ok(effective.QWEN_DATA_DIR.split(",").includes(path.join(windowsHome, ".qwen")));
  assert.ok(effective.COPILOT_OTEL_DIR.split(",").includes(path.join(windowsHome, ".copilot", "otel")));
  const inventory = await sourceInventory({ env: effective, home, cwd: root });
  assert.deepEqual(inventory.sources, ["copilot", "kimi", "qwen"]);
});

test("discovers the Windows AppData Goose session store from WSL", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "usagemax-wsl-goose-"));
  const home = path.join(root, "linux-home");
  const users = path.join(root, "mnt", "c", "Users");
  const windowsHome = path.join(users, "austi");
  const database = path.join(windowsHome, "AppData", "Roaming", "Block", "goose", "data", "sessions", "sessions.db");
  await mkdir(path.dirname(database), { recursive: true });
  await writeFile(database, "db");

  const env = { HOME: home, USAGEMAX_WSL_USERS_DIR: users, WSL_DISTRO_NAME: "Ubuntu" };
  const discovery = await discoverWslWindowsHomeStatus({ env, platform: "linux" });
  assert.equal(discovery.status, "discovered");
  assert.deepEqual(discovery.selected, [windowsHome]);

  const effective = await ccusageEnvironment({ env, platform: "linux" });
  assert.ok(effective.GOOSE_PATH_ROOT.split(",").includes(path.join(windowsHome, "AppData", "Roaming", "Block", "goose")));
  const definitions = sourceDefinitions({ env: effective, home, cwd: root });
  assert.ok(definitions.some((item) => item.source === "goose" && item.path === database));
  const inventory = await sourceInventory({ env: effective, home, cwd: root });
  assert.deepEqual(inventory.sources, ["goose"]);
});

test("keeps WSL Windows profile discovery conservative when multiple profiles qualify", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "usagemax-wsl-ambiguous-"));
  const users = path.join(root, "mnt", "c", "Users");
  const first = path.join(users, "first");
  const second = path.join(users, "second");
  await mkdir(path.join(first, ".kimi"), { recursive: true });
  await mkdir(path.join(second, ".copilot", "otel"), { recursive: true });

  const env = { HOME: path.join(root, "linux-home"), USAGEMAX_WSL_USERS_DIR: users, WSL_DISTRO_NAME: "Ubuntu" };
  const discovery = await discoverWslWindowsHomeStatus({ env, platform: "linux" });
  assert.equal(discovery.status, "ambiguous");
  assert.deepEqual(discovery.candidates, [first, second]);
  assert.deepEqual(discovery.selected, []);
  const effective = await ccusageEnvironment({ env, platform: "linux" });
  assert.equal(effective.COPILOT_OTEL_DIR, path.join(env.HOME, ".copilot", "otel"));
  assert.ok(!effective.KIMI_DATA_DIR.includes(first));
});

test("reports unavailable and non-WSL Windows-home discovery states", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "usagemax-wsl-empty-"));
  const users = path.join(root, "mnt", "c", "Users");
  await mkdir(path.join(users, "austi", "Documents"), { recursive: true });

  assert.equal((await discoverWslWindowsHomeStatus({ env: { WSL_DISTRO_NAME: "Ubuntu", USAGEMAX_WSL_USERS_DIR: users }, platform: "linux" })).status, "unavailable");
  assert.equal((await discoverWslWindowsHomeStatus({ env: { WSL_DISTRO_NAME: "Ubuntu" }, platform: "darwin" })).status, "not-applicable");
});

test("discovers Claude Desktop agent homes, mirrors, renamed backups, and archives", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "usagemax-claude-roots-"));
  const desktopRoot = path.join(home, "Library", "Application Support", "Claude", "local-agent-mode-sessions", "session", "agent", ".claude");
  const mirrorRoot = path.join(home, ".cc-mirror", "mclaude", "config");
  const backupRoot = path.join(home, "superclaude-backup.20250101");
  const archive = path.join(home, ".claude", "backups", "history.tar.gz");
  for (const root of [desktopRoot, mirrorRoot, backupRoot]) {
    await mkdir(path.join(root, "projects"), { recursive: true });
    await writeFile(path.join(root, "projects", `${path.basename(root)}.jsonl`), "{}\n");
  }
  await mkdir(path.dirname(archive), { recursive: true });
  await writeFile(archive, "archive");

  const effective = await ccusageEnvironment({ env: { HOME: home }, platform: "darwin" });
  const claudeRoots = effective.CLAUDE_CONFIG_DIR.split(",");
  assert.ok(claudeRoots.includes(desktopRoot));
  assert.ok(claudeRoots.includes(mirrorRoot));
  assert.ok(claudeRoots.includes(backupRoot));
  const archives = await discoverProviderArchives({ env: effective, home });
  assert.deepEqual(archives.map((item) => item.path), [archive]);
});

test("fingerprints WAL changes, named pi stores, and previously missing sources", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "usagemax-sources-"));
  const home = path.join(root, "home");
  const cwd = path.join(root, "work");
  await mkdir(path.join(home, ".factory", "sessions"), { recursive: true });
  await mkdir(path.join(home, ".hermes"), { recursive: true });
  await mkdir(path.join(home, ".grok", "sessions", "p", "s"), { recursive: true });
  await mkdir(path.join(home, ".custom-pi"), { recursive: true });
  await mkdir(path.join(cwd, ".ccusage"), { recursive: true });
  await writeFile(path.join(home, ".factory", "sessions", "one.settings.json"), "{}\n");
  await writeFile(path.join(home, ".hermes", "state.db"), "db");
  await writeFile(path.join(home, ".hermes", "state.db-wal"), "wal-1");
  await writeFile(path.join(home, ".grok", "sessions", "p", "s", "updates.jsonl"), "{}\n");
  await writeFile(path.join(home, ".custom-pi", "one.jsonl"), "{}\n");
  await writeFile(path.join(cwd, ".ccusage", "ccusage.json"), JSON.stringify({ pi: { stores: [{ name: "custom", path: path.join(home, ".custom-pi") }] } }));

  const first = await sourceInventory({ env: { HOME: home }, cwd, home });
  assert.deepEqual(first.sources, ["custom", "droid", "grok", "hermes"]);
  assert.equal(first.complete, true);
  await writeFile(path.join(home, ".hermes", "state.db-wal"), "wal-2-is-different");
  const second = await sourceInventory({ env: { HOME: home }, cwd, home });
  assert.notEqual(second.fingerprint, first.fingerprint);
});

test("never treats a truncated inventory as a no-change certificate", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "usagemax-cap-"));
  const sessions = path.join(root, ".codex", "sessions");
  await mkdir(sessions, { recursive: true });
  await writeFile(path.join(sessions, "one.jsonl"), "{}\n");
  await writeFile(path.join(sessions, "two.jsonl"), "{}\n");
  const inventory = await sourceInventory({ env: { HOME: root }, home: root, cwd: root, maxFiles: 1 });
  assert.equal(inventory.truncated, true);
  assert.equal(inventory.complete, false);
});

test("reports only aggregate metadata for unusually large JSONL inputs", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "usagemax-large-log-"));
  const file = path.join(root, ".codex", "sessions", "large.jsonl");
  await mkdir(path.dirname(file), { recursive: true });
  const handle = await open(file, "w");
  try { await handle.truncate(LARGE_JSONL_WARNING_BYTES + 1); } finally { await handle.close(); }

  const inventory = await sourceInventory({ env: { HOME: root }, home: root, cwd: root });
  assert.equal(inventory.largeJsonlFiles.thresholdBytes, LARGE_JSONL_WARNING_BYTES);
  assert.equal(inventory.largeJsonlFiles.count, 1);
  assert.equal(inventory.largeJsonlFiles.bytes, LARGE_JSONL_WARNING_BYTES + 1);
  assert.deepEqual(inventory.largeJsonlFiles.bySource, [{ source: "codex", count: 1, bytes: LARGE_JSONL_WARNING_BYTES + 1 }]);
  assert.equal(JSON.stringify(inventory.largeJsonlFiles).includes("large.jsonl"), false);
});
