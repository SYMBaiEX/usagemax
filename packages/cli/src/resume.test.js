import assert from "node:assert/strict";
import test from "node:test";
import { resumeUpload, restartExpiredUpload, withConfigLock } from "./resume.js";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanPolicy } from "./core.js";

function fixture() {
  return {
    snapshots: { old: { totalTokens: 100 } },
    pendingSync: {
      version: 1, runId: "fixed", cursor: 0, result: { changedRows: 1 },
      requests: ["begin", "sessions", "partitions", "complete"].map((operation) => ({ operation, payload: { runId: "fixed", stamp: "immutable" } })),
      checkpoint: { snapshots: { old: { totalTokens: 120 } }, lastSyncComplete: false },
    },
  };
}
test("expired runs require an explicit restart and preserve committed snapshots", async () => {
  const config = fixture();
  let saved;
  assert.throws(() => restartExpiredUpload(config), /Only an expired/);
  await assert.rejects(resumeUpload(config, { save: async value => { saved = structuredClone(value); }, request: async () => { const error = new Error("expired"); error.code = "snapshot_run_expired"; throw error; } }), /sync --restart/);
  assert.equal(saved.pendingSync.terminalError, "snapshot_run_expired");
  restartExpiredUpload(saved);
  assert.equal(saved.pendingSync, undefined);
  assert.equal(saved.snapshots.old.totalTokens, 100);
  assert.equal(saved.lastFullSyncAt, undefined);
});
test("lost response resumes exact pending request and does not advance baseline prematurely", async () => {
  let disk = fixture();
  const sent = [];
  const save = async (config) => { disk = structuredClone(config); };
  await assert.rejects(resumeUpload(structuredClone(disk), { save, request: async (_, operation, payload) => {
    sent.push({ operation, payload });
    if (operation === "partitions") throw new Error("response lost after commit");
    return { ok: true };
  } }), /resume saved run fixed/);
  assert.equal(disk.pendingSync.cursor, 2);
  assert.equal(disk.snapshots.old.totalTokens, 100);
  const config = structuredClone(disk);
  const resumed = await resumeUpload(config, { save, request: async (_, operation, payload) => { sent.push({ operation, payload }); return { ok: true }; } });
  assert.deepEqual(sent[2], sent[3]);
  assert.deepEqual(sent.map((s) => s.operation), ["begin", "sessions", "partitions", "partitions", "complete"]);
  assert.equal(disk.snapshots.old.totalTokens, 120);
  assert.equal(disk.pendingSync, undefined);
  assert.equal(config.pendingSync, undefined);
  assert.equal(resumed.uploadMetrics.operationsAcknowledged, 2);
  assert.equal(resumed.uploadMetrics.checkpointWrites, 3);
});
test("local write failure after complete replays completion and retains old baseline", async () => {
  let disk = fixture();
  disk.pendingSync.cursor = 3;
  const operations = [];
  await assert.rejects(resumeUpload(structuredClone(disk), {
    save: async () => { throw new Error("disk full"); },
    request: async (_, op) => { operations.push(op); return { ok: true }; },
  }), /disk full/);
  assert.equal(disk.snapshots.old.totalTokens, 100);
  await resumeUpload(structuredClone(disk), {
    save: async (config) => { disk = structuredClone(config); },
    request: async (_, op) => { operations.push(op); return { ok: true }; },
  });
  assert.deepEqual(operations, ["complete", "complete"]);
  assert.equal(disk.snapshots.old.totalTokens, 120);
});
test("failure of final checkpoint write resumes without issuing new network requests", async () => {
  let disk = fixture();
  disk.pendingSync.cursor = 3;
  let writes = 0;
  await assert.rejects(resumeUpload(structuredClone(disk), {
    save: async (config) => { if (++writes === 2) throw new Error("disk full"); disk = structuredClone(config); },
    request: async () => ({ ok: true }),
  }));
  assert.equal(disk.pendingSync.cursor, 4);
  await resumeUpload(structuredClone(disk), {
    save: async (config) => { disk = structuredClone(config); }, request: async () => assert.fail("already acknowledged"),
  });
  assert.equal(disk.snapshots.old.totalTokens, 120);
});

test("concurrent commands cannot overwrite pending runs; failures release lock", async () => {
  const directory = await mkdtemp(join(tmpdir(), "usagemax-lock-"));
  try {
    await assert.rejects(withConfigLock(directory, async () => {
      await assert.rejects(withConfigLock(directory, async () => assert.fail("must not enter")), /locked by PID/);
      assert.equal((await readFile(join(directory, "collector.lock"), "utf8")).trim(), String(process.pid));
      throw new Error("interrupted upload");
    }), /interrupted upload/);
    assert.equal(await withConfigLock(directory, async () => "resumed"), "resumed");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("exact resume commits saved fingerprint, so same partial scan skips and new files do not", async () => {
  let disk = fixture();
  Object.assign(disk.pendingSync.checkpoint, {
    snapshotProtocolVersion: 2, sourceInventoryVersion: 3, knownSources: ["codex"],
    lastScanSucceeded: true, lastCoverage: "partial", sourceFingerprint: "original-inventory",
    lastReconciledDay: "2026-09-15", lastFullSyncAt: "2026-09-15T00:00:00Z",
  });
  const original = structuredClone(disk.pendingSync.requests);
  const sent = [];
  await resumeUpload(structuredClone(disk), {
    save: async (config) => { disk = structuredClone(config); },
    request: async (_, operation, payload) => { sent.push({ operation, payload }); return { ok: true }; },
  });
  assert.deepEqual(sent, original);
  assert.equal(disk.lastSyncComplete, false);
  const inventory = { sources: ["codex"], complete: true, errors: 0, truncated: false, fingerprint: "original-inventory" };
  const options = { today: "2026-09-15", now: Date.parse("2026-09-15T01:00:00Z"), inventoryVersion: 3 };
  assert.equal(scanPolicy(disk, inventory, options).skip, true);
  assert.equal(scanPolicy(disk, { ...inventory, fingerprint: "files-changed-during-upload" }, options).skip, false);
  assert.equal(disk.sourceFingerprint, "original-inventory");
});
