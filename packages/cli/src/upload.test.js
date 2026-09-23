import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_PARTITION_REQUEST_BYTES,
  PARTITION_BATCH_SIZE,
  SESSION_BATCH_SIZE,
  buildSnapshotUploadRequests,
} from "./upload.js";

test("batches historical sessions and partitions while preserving order", () => {
  const sessions = Array.from({ length: 4_613 }, (_, index) => ({ sessionKey: String(index).padStart(64, "0") }));
  const partitions = Array.from({ length: 235 }, (_, index) => ({ partitionId: `partition-${index}` }));
  const plan = buildSnapshotUploadRequests({ runId: "stable-run", begin: { runId: "stable-run" }, sessions, partitions });

  assert.equal(SESSION_BATCH_SIZE, 250);
  assert.equal(PARTITION_BATCH_SIZE, 20);
  assert.equal(plan.sessionBatches, 19);
  assert.equal(plan.partitionBatches, 12);
  assert.equal(plan.requestCount, 33);
  assert.deepEqual(plan.requests.filter((request) => request.operation === "sessions")
    .flatMap((request) => request.payload.sessions), sessions);
  assert.deepEqual(plan.requests.filter((request) => request.operation === "partitions")
    .flatMap((request) => request.payload.partitions), partitions);
  assert.ok(plan.maxPartitionRequestBytes <= MAX_PARTITION_REQUEST_BYTES);
  assert.equal(plan.requests[0].operation, "begin");
  assert.equal(plan.requests.at(-1).operation, "complete");
});

test("splits partition batches at the byte budget and rejects one oversized partition", () => {
  const partitions = Array.from({ length: 10 }, (_, index) => ({ partitionId: `p-${index}`, rows: ["x".repeat(180_000)] }));
  const plan = buildSnapshotUploadRequests({ runId: "stable-run", begin: {}, partitions });
  assert.ok(plan.partitionBatches > 1);
  assert.deepEqual(plan.requests.filter((request) => request.operation === "partitions")
    .flatMap((request) => request.payload.partitions), partitions);
  assert.ok(plan.maxPartitionRequestBytes < MAX_PARTITION_REQUEST_BYTES);

  assert.throws(() => buildSnapshotUploadRequests({
    runId: "stable-run",
    begin: {},
    partitions: [{ partitionId: "too-large", rows: ["x".repeat(MAX_PARTITION_REQUEST_BYTES)] }],
  }), /too large to upload safely/);
});
