import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkForUpdate, compareVersions, REGISTRY_URL } from "./updates.js";

test("compares strict semantic versions", () => {
  assert.equal(compareVersions("0.3.7", "0.3.6"), 1);
  assert.equal(compareVersions("0.3.6", "0.3.6"), 0);
  assert.equal(compareVersions("0.3.5", "0.3.6"), -1);
  assert.equal(compareVersions("latest", "0.3.6"), 0);
});
test("caches the npm check and reports a newer release", async () => {
  const directory = await mkdtemp(join(tmpdir(), "usagemax-updates-"));
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    assert.equal(url, REGISTRY_URL);
    return new Response(JSON.stringify({ version: "0.3.7" }), { status: 200 });
  };
  try {
    const first = await checkForUpdate(directory, "0.3.6", { now: 1000, fetchImpl });
    const second = await checkForUpdate(directory, "0.3.6", { now: 1001, fetchImpl });
    assert.equal(first.newer, true);
    assert.equal(second.newer, true);
    assert.equal(calls, 1);
    assert.match(await readFile(join(directory, "update-check.json"), "utf8"), /0\.3\.7/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("failed registry checks remain non-fatal", async () => {
  const directory = await mkdtemp(join(tmpdir(), "usagemax-updates-"));
  try {
    const result = await checkForUpdate(directory, "0.3.6", { fetchImpl: async () => { throw new Error("offline"); } });
    assert.equal(result.latest, null);
    assert.equal(result.newer, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
