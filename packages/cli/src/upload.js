export const SESSION_BATCH_SIZE = 250;
export const PARTITION_BATCH_SIZE = 20;
// Keep headroom below the server's 2 MB request cap for UTF-8 expansion and
// protocol fields added by older/newer clients.
export const MAX_PARTITION_REQUEST_BYTES = 1_500_000;

function serializedPartitionRequestBytes(runId, partitions) {
  return Buffer.byteLength(JSON.stringify({ operation: "partitions", runId, partitions }), "utf8");
}

/** Build a stable, replayable upload journal without reordering partition chunks. */
export function buildSnapshotUploadRequests({ runId, begin, sessions = [], partitions = [] }) {
  const requests = [{ operation: "begin", payload: begin }];
  let sessionBatches = 0;
  let partitionBatches = 0;

  for (let offset = 0; offset < sessions.length; offset += SESSION_BATCH_SIZE) {
    requests.push({
      operation: "sessions",
      payload: { runId, sessions: sessions.slice(offset, offset + SESSION_BATCH_SIZE) },
    });
    sessionBatches += 1;
  }

  let batch = [];
  const flushPartitions = () => {
    if (!batch.length) return;
    requests.push({ operation: "partitions", payload: { runId, partitions: batch } });
    batch = [];
    partitionBatches += 1;
  };

  for (const partition of partitions) {
    const candidate = [...batch, partition];
    const bytes = serializedPartitionRequestBytes(runId, candidate);
    if (bytes > MAX_PARTITION_REQUEST_BYTES && batch.length) {
      flushPartitions();
    }
    const singlePartitionBytes = serializedPartitionRequestBytes(runId, [partition]);
    if (singlePartitionBytes > MAX_PARTITION_REQUEST_BYTES) {
      throw new Error("A usage partition is too large to upload safely; no data was uploaded. Run `usagemax doctor --deep` and contact UsageMax support with the CLI version.");
    }
    if (batch.length >= PARTITION_BATCH_SIZE
      || serializedPartitionRequestBytes(runId, [...batch, partition]) > MAX_PARTITION_REQUEST_BYTES) {
      flushPartitions();
    }
    batch.push(partition);
  }
  flushPartitions();

  requests.push({ operation: "complete", payload: { runId } });
  const maxPartitionRequestBytes = requests
    .filter((request) => request.operation === "partitions")
    .reduce((maxBytes, request) => Math.max(maxBytes, serializedPartitionRequestBytes(runId, request.payload.partitions)), 0);
  return {
    requests,
    sessionBatches,
    partitionBatches,
    requestCount: requests.length,
    maxPartitionRequestBytes,
  };
}
