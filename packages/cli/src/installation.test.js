import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { stableInstallationId, validInstallationId } from "./installation.js";

test("creates one stable identity across simultaneous runs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "usagemax-installation-"));
  try {
    const ids = await Promise.all(Array.from({ length: 12 }, () => stableInstallationId(directory)));
    assert.ok(validInstallationId(ids[0]));
    assert.equal(new Set(ids).size, 1);
    const saved = JSON.parse(await readFile(join(directory, "installation.json"), "utf8"));
    assert.equal(saved.id, ids[0]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("migrates the prior collector identity and never changes it for a rename", async () => {
  const directory = await mkdtemp(join(tmpdir(), "usagemax-installation-"));
  const prior = "9b5ae1c1-a2de-4e67-8f13-d4a2bb8fcb87";
  try {
    assert.equal(await stableInstallationId(directory, prior), prior);
    assert.equal(await stableInstallationId(directory, "11111111-2222-4333-8444-555555555555"), prior);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
