import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../packages/cli/", import.meta.url));
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const directory = await mkdtemp(join(tmpdir(), "usagemax-registry-check-"));
try {
  const args = ["pack", "--ignore-scripts", "--json", "--cache", join(directory, "cache"), "--pack-destination", directory];
  const [local] = JSON.parse((await exec("npm", args, { cwd: root })).stdout);
  const [published] = JSON.parse((await exec("npm", [...args, `usagemax@${pkg.version}`], { cwd: directory })).stdout);
  assert.equal(published.shasum, local.shasum, "Registry artifact differs from tested source");
  const archive = join(directory, published.filename);
  const files = (await exec("tar", ["-tzf", archive])).stdout.trim().split("\n");
  assert.ok(files.every(file => file.startsWith("package/") && !file.split("/").includes("..")), "Unsafe archive path");
  await exec("tar", ["-xzf", archive, "-C", directory]);
  const entry = join(directory, "package/src/cli.js");
  assert.equal((await exec(process.execPath, [entry, "--version"])).stdout.trim(), pkg.version);
  assert.match((await exec(process.execPath, [entry, "--help"])).stdout, /--restart/);
  const { buildSnapshotPlan } = await import(pathToFileURL(join(directory, "package/src/core.js")));
  const report = { daily: [{ agent: "codex", period: "2026-09-15", modelBreakdowns: [{ modelName: "test-model", inputTokens: 1 }] }] };
  const plan = buildSnapshotPlan(report, {}, { revision: Date.parse("2026-09-15T00:01:00Z") });
  assert.equal(plan.partitions[0].rows[0].lastUsedAt, Date.parse("2026-09-15T00:00:00Z"));
  console.log(JSON.stringify({ package: `usagemax@${pkg.version}`, shasum: published.shasum, files: files.length, sourceMatch: true, version: true, help: true, snapshotTimestamp: true }));
} finally {
  await rm(directory, { recursive: true, force: true });
}
