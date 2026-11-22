import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../packages/cli/", import.meta.url));
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
assert.equal(pkg.name, "usagemax");
assert.match(pkg.version, /^\d{1,6}\.\d{1,6}\.\d{1,6}$/);
const readPackResult = (stdout, packageName) => {
  const result = JSON.parse(stdout);
  return Array.isArray(result) ? result[0] : result?.[packageName] ?? result;
};
async function registryResponse(path) {
  const url = new URL(path, "https://registry.npmjs.org");
  // A lookup during npm's processing window can cache a 404 for five minutes.
  url.searchParams.set("verify", randomUUID());
  return fetch(url, { redirect: "error", signal: AbortSignal.timeout(15_000) });
}

async function verifyRegistryTarball(local) {
  const delays = [0, 2, 4, 8, 15, 25, 35, 45, 60, 60];
  const filename = `${pkg.name}-${pkg.version}.tgz`;
  const tarballPath = `/${pkg.name}/-/${filename}`;
  for (const [index, seconds] of delays.entries()) {
    await delay(seconds * 1000);
    const metadata = await registryResponse(`/${pkg.name}/${pkg.version}`);
    let status = metadata.status;
    if (metadata.ok) {
      const release = await metadata.json();
      assert.equal(release.version, pkg.version);
      assert.equal(release.dist?.tarball, `https://registry.npmjs.org${tarballPath}`);
      const artifact = await registryResponse(tarballPath);
      status = artifact.status;
      if (artifact.ok) {
        const bytes = Buffer.from(await artifact.arrayBuffer());
        const shasum = createHash("sha1").update(bytes).digest("hex");
        const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
        assert.equal(shasum, release.dist.shasum, "Registry tarball differs from its metadata hash");
        assert.equal(shasum, local.shasum, "Registry artifact differs from tested source");
        assert.equal(integrity, local.integrity, "Registry artifact differs from tested source");
        return;
      }
    }
    if (index === delays.length - 1 || (status !== 404 && status !== 429 && status < 500)) {
      throw new Error(`Registry artifact ${pkg.name}@${pkg.version} is unavailable (HTTP ${status}).`);
    }
    console.log(`Waiting for ${pkg.name}@${pkg.version} to become available on the registry.`);
  }
}
const directory = await mkdtemp(join(tmpdir(), "usagemax-registry-check-"));
try {
  const args = ["--ignore-scripts", "--json", "--cache", join(directory, "cache"), "--pack-destination", directory];
  const local = readPackResult((await exec("npm", ["pack", ...args], { cwd: root })).stdout, pkg.name);
  await verifyRegistryTarball(local);
  const archive = join(directory, local.filename);
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
  console.log(JSON.stringify({ package: `usagemax@${pkg.version}`, shasum: local.shasum, files: files.length, sourceMatch: true, version: true, help: true, snapshotTimestamp: true }));
} finally {
  await rm(directory, { recursive: true, force: true });
}
