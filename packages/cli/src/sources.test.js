import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { ccusageEnvironment, ccusageHome, discoverProviderArchives, sourceDefinitions, sourceInventory, SUPPORTED_SOURCES } from "./sources.js";

test("matches ccusage home precedence on Windows and POSIX", () => {
  assert.equal(ccusageHome({ HOME: "/linux", USERPROFILE: "C:\\Users\\me" }), "/linux");
  assert.equal(ccusageHome({ USERPROFILE: "C:\\Users\\me" }), "C:\\Users\\me");
  assert.equal(ccusageHome({ HOMEDRIVE: "D:", HOMEPATH: "\\Users\\me" }), "D:\\Users\\me");
});

test("resolves all 16 ccusage sources with Windows-safe paths", () => {
  const definitions = sourceDefinitions({ env: {}, home: "C:\\Users\\me", cwd: "C:\\work", pathApi: path.win32 });
  const sources = [...new Set(definitions.filter((item) => item.source !== "ccusage-config").map((item) => item.source))].sort();
  assert.deepEqual(sources, [...SUPPORTED_SOURCES].sort());
  assert.ok(definitions.some((item) => item.path === "C:\\Users\\me\\.factory\\sessions"));
  assert.ok(definitions.some((item) => item.path === "C:\\Users\\me\\.hermes\\state.db"));
  assert.ok(definitions.some((item) => item.path === "C:\\Users\\me\\.copilot\\otel"));
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
