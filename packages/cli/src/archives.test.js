import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { prepareArchiveRecovery, safeArchiveMember } from "./archives.js";
import { ccusageEnvironment } from "./sources.js";

const executeFile = promisify(execFile);

test("accepts only relative Claude project JSONL members", () => {
  assert.equal(safeArchiveMember("./projects/work/session.jsonl"), true);
  assert.equal(safeArchiveMember("backup/projects/work/session.jsonl"), true);
  assert.equal(safeArchiveMember("../projects/session.jsonl"), false);
  assert.equal(safeArchiveMember("/projects/session.jsonl"), false);
  assert.equal(safeArchiveMember("projects/session.json"), false);
  assert.equal(safeArchiveMember(".codex/sessions/2026/session.jsonl", "codex"), true);
  assert.equal(safeArchiveMember("projects/session.jsonl", "codex"), false);
});

test("extracts archive project logs temporarily and removes them on cleanup", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "usagemax-archive-home-"));
  let recovery;
  try {
    const fixture = path.join(home, "fixture");
    const project = path.join(fixture, "projects", "work");
    const archiveDirectory = path.join(home, ".claude", "backups");
    const archive = path.join(archiveDirectory, "history.tar.gz");
    const codexFixture = path.join(home, "codex-fixture");
    const codexSession = path.join(codexFixture, ".codex", "sessions", "2025", "session.jsonl");
    const codexArchiveDirectory = path.join(home, ".codex", "backups");
    const codexArchive = path.join(codexArchiveDirectory, "history.tar.gz");
    await mkdir(project, { recursive: true });
    await mkdir(archiveDirectory, { recursive: true });
    await mkdir(path.dirname(codexSession), { recursive: true });
    await mkdir(codexArchiveDirectory, { recursive: true });
    await writeFile(path.join(project, "session.jsonl"), "{}\n");
    await writeFile(codexSession, "{}\n");
    await executeFile("tar", ["-czf", archive, "-C", fixture, "."]);
    await executeFile("tar", ["-czf", codexArchive, "-C", codexFixture, "."]);

    const baseEnv = await ccusageEnvironment({ env: { HOME: home }, platform: process.platform });
    recovery = await prepareArchiveRecovery(baseEnv);
    assert.equal(recovery.archives, 2);
    assert.equal(recovery.unsupported, 0);
    const recoveredProject = recovery.env.CLAUDE_CONFIG_DIR.split(",").find((item) => item.includes("usagemax-recover-") && item.endsWith("projects"));
    assert.ok(recoveredProject);
    await access(path.join(recoveredProject, "work", "session.jsonl"));
    const recoveredCodex = recovery.env.CODEX_HOME.split(",").find((item) => item.includes("usagemax-recover-") && item.endsWith(".codex"));
    assert.ok(recoveredCodex);
    await access(path.join(recoveredCodex, "sessions", "2025", "session.jsonl"));
    const recoveryRoot = path.dirname(path.dirname(recoveredProject));
    await recovery.cleanup();
    recovery = undefined;
    await assert.rejects(stat(recoveryRoot));
  } finally {
    await recovery?.cleanup();
    await rm(home, { force: true, recursive: true });
  }
});
