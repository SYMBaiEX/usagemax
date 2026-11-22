import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../packages/cli/", import.meta.url));
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const readPackResult = (stdout, packageName) => {
  const result = JSON.parse(stdout);
  return Array.isArray(result) ? result[0] : result?.[packageName] ?? result;
};
async function packFromRegistry(args, directory) {
  const delays = [0, 2, 4, 8, 15, 25, 35, 45];
  for (const [index, seconds] of delays.entries()) {
    await delay(seconds * 1000);
    try {
      return readPackResult((await exec("npm", ["pack", ...args, "--prefer-online", `${pkg.name}@${pkg.version}`], { cwd: directory, timeout: 30_000 })).stdout, pkg.name);
    } catch (error) {
      if (index === delays.length - 1 || !/npm error code (?:ETARGET|E404)\b/.test(error.stderr ?? "")) throw error;
      console.log(`Waiting for ${pkg.name}@${pkg.version} to become available on the registry.`);
    }
  }
}
const directory = await mkdtemp(join(tmpdir(), "usagemax-registry-check-"));
try {
  const args = ["--ignore-scripts", "--json", "--cache", join(directory, "cache"), "--pack-destination", directory];
  const local = readPackResult((await exec("npm", ["pack", ...args], { cwd: root })).stdout, pkg.name);
  const published = await packFromRegistry(args, directory);
  assert.equal(published.shasum, local.shasum, "Registry artifact differs from tested source");
  const archive = join(directory, published.filename);
  const files = (await exec("tar", ["-tzf", archive])).stdout.trim().split("\n");
  assert.ok(files.every(file => file.startsWith("package/") && !file.split("/").includes("..")), "Unsafe archive path");
  await exec("tar", ["-xzf", archive, "-C", directory]);
  const entry = join(directory, "package/src/cli.js");
  assert.equal((await exec(process.execPath, [entry, "--version"])).stdout.trim(), pkg.version);
  assert.match((await exec(process.execPath, [entry, "--help"])).stdout, /--restart/);
  assert.match((await exec(process.execPath, [entry, "--help"])).stdout, /service install/);
  const { servicePlan, intervalMinutes } = await import(pathToFileURL(join(directory, "package/src/service.js")));
  assert.equal(intervalMinutes(), 15);
  assert.match(servicePlan({ directory, executable: process.execPath, cli: entry, platform: "linux", home: directory }).files[1][1], /OnUnitInactiveSec=15m/);
  const { buildSnapshotPlan } = await import(pathToFileURL(join(directory, "package/src/core.js")));
  const report = { daily: [{ agent: "codex", period: "2026-09-15", modelBreakdowns: [{ modelName: "test-model", inputTokens: 1 }] }] };
  const plan = buildSnapshotPlan(report, {}, { revision: Date.parse("2026-09-15T00:01:00Z") });
  assert.equal(plan.partitions[0].rows[0].lastUsedAt, Date.parse("2026-09-15T00:00:00Z"));
  console.log(JSON.stringify({ package: `usagemax@${pkg.version}`, shasum: published.shasum, files: files.length, sourceMatch: true, version: true, help: true, snapshotTimestamp: true }));
} finally {
  await rm(directory, { recursive: true, force: true });
}
