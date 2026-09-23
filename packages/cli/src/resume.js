// A pending run is saved before network I/O. Persisting the acknowledged cursor
// after each request permits replays when the response or local write is lost.
// The server must receipt begin, chunks, sessions and complete idempotently.
export async function resumeUpload(config, { save, request, warn = () => {}, onProgress = () => {} }) {
  const pending = config.pendingSync;
  if (!pending || pending.version !== 1 || !Array.isArray(pending.requests)) {
    throw new Error("Invalid saved sync; preserve the config for recovery.");
  }
  try {
    // Counts logical snapshot operations acknowledged by the server. A single
    // operation can include transport retries inside the request function.
    const uploadMetrics = { operationsAcknowledged: 0, operationMs: 0, checkpointWrites: 0, checkpointMs: 0 };
    for (let index = pending.cursor; index < pending.requests.length; index += 1) {
      const { operation, payload } = pending.requests[index];
      onProgress({ index: index + 1, total: pending.requests.length, operation });
      const requestStarted = Date.now();
      const response = await request(config, operation, payload, operation === "partitions" ? 60_000 : 30_000);
      uploadMetrics.operationsAcknowledged += 1;
      uploadMetrics.operationMs += Date.now() - requestStarted;
      warn(response);
      pending.cursor = index + 1;
      const checkpointStarted = Date.now();
      await save(config);
      uploadMetrics.checkpointWrites += 1;
      uploadMetrics.checkpointMs += Date.now() - checkpointStarted;
      onProgress({ index: index + 1, total: pending.requests.length, operation, acknowledged: true });
    }
    // Commit local baseline and remove the journal in the same atomic write.
    const next = { ...config, ...pending.checkpoint };
    delete next.pendingSync;
    const finalCheckpointStarted = Date.now();
    await save(next);
    uploadMetrics.checkpointWrites += 1;
    uploadMetrics.checkpointMs += Date.now() - finalCheckpointStarted;
    Object.assign(config, next);
    delete config.pendingSync;
    return { ...pending.result, resumed: true, uploadMetrics };
  } catch (error) {
    if (error?.code === "snapshot_run_expired") {
      pending.terminalError = "snapshot_run_expired";
      await save(config);
      throw new Error("Saved upload expired. Run usagemax sync --restart to rescan retained history while preserving the last committed checkpoint. Already accepted usage remains on the server.", { cause: error });
    }
    throw new Error(`${error instanceof Error ? error.message : "Upload failed."} Run usagemax sync again to resume saved run ${pending.runId}; its payload and checkpoints have been retained.`, { cause: error });
  }
}

export function restartExpiredUpload(config) {
  if (config.pendingSync?.terminalError !== "snapshot_run_expired") throw new Error("Only an expired upload can restart. Run sync normally to resume or verify its status first.");
  delete config.pendingSync;
  config.lastFullSyncAt = undefined;
  config.sourceFingerprint = null;
}
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function withConfigLock(directory, action) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, "collector.lock");
  try {
    await writeFile(path, `${process.pid}\n`, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const owner = (await readFile(path, "utf8").catch(() => "unknown")).trim();
    const busy = new Error(`Collector config is locked by PID ${/^\d+$/.test(owner) ? owner : "unknown"}. If that process has exited, remove only ${path} and rerun sync; keep config.json for resume.`);
    busy.code = "USAGEMAX_BUSY";
    throw busy;
  }
  try {
    return await action();
  } finally {
    await unlink(path);
  }
}
