import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const exec = promisify(execFile);
test("offline packed artifact includes scheduler and emits midnight timestamps before noon", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "usagemax-artifact-"));
  try {
    const root = dirname(dirname(fileURLToPath(import.meta.url)));
    const { stdout } = await exec("npm", ["pack", "--offline", "--ignore-scripts", "--json", "--cache", join(temporary, "cache"), "--pack-destination", temporary], { cwd: root });
    const [packed] = JSON.parse(stdout);
    assert.equal(packed.version, "0.3.4");
    await exec("tar", ["-xzf", join(temporary, packed.filename), "-C", temporary]);
    const artifact = join(temporary, "package");
    assert.equal(JSON.parse(await readFile(join(artifact, "package.json"), "utf8")).version, "0.3.4");
    assert.equal((await exec(process.execPath, [join(artifact, "src/cli.js"), "--version"])).stdout.trim(), "0.3.4");
    await import(pathToFileURL(join(artifact, "src/service.js")));
    const { buildSnapshotPlan, buildDeltaPlan } = await import(pathToFileURL(join(artifact, "src/core.js")));
    const report = { daily: [{ agent: "codex", period: "2026-09-15", modelBreakdowns: [{ modelName: "gpt-5", inputTokens: 1 }] }] };
    const midnight = Date.parse("2026-09-15T00:00:00Z");
    const morning = Date.parse("2026-09-15T00:01:00Z");
    const plan = buildSnapshotPlan(report, {}, { revision: morning });
    assert.equal(plan.partitions[0].rows[0].lastUsedAt, midnight);
    assert.ok(plan.partitions[0].rows[0].lastUsedAt <= morning);
    assert.equal(Date.parse(buildDeltaPlan(report, {}, "fixture").plan[0].event.occurredAt), midnight);
    await import(pathToFileURL(join(artifact, "src/transport.js")));
    await import(pathToFileURL(join(artifact, "src/resume.js")));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
