// A pending run is saved before network I/O. Persisting the acknowledged cursor
// after each request permits replays when the response or local write is lost.
// The server must receipt begin, chunks, sessions and complete idempotently.
export async function resumeUpload(config, { save, request, warn = () => {} }) {
  const pending = config.pendingSync;
  if (!pending || pending.version !== 1 || !Array.isArray(pending.requests)) {
    throw new Error("Invalid saved sync; preserve the config for recovery.");
  }
  try {
    for (let index = pending.cursor; index < pending.requests.length; index += 1) {
      const { operation, payload } = pending.requests[index];
      const response = await request(config, operation, payload, operation === "partitions" ? 60_000 : 30_000);
      warn(response);
      pending.cursor = index + 1;
      await save(config);
    }
    // Commit local baseline and remove the journal in the same atomic write.
    const next = { ...config, ...pending.checkpoint };
    delete next.pendingSync;
    await save(next);
    Object.assign(config, next);
    delete config.pendingSync;
    return { ...pending.result, resumed: true };
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
    throw new Error(`Collector config is locked by PID ${/^\d+$/.test(owner) ? owner : "unknown"}. If that process has exited, remove only ${path} and rerun sync; keep config.json for resume.`);
  }
  try {
    return await action();
  } finally {
    await unlink(path);
  }
}
