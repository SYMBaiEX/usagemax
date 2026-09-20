import assert from "node:assert/strict";
import test from "node:test";

import { createProgress } from "./progress.js";

test("progress can be disabled for JSON, quiet, and scheduled runs", () => {
  assert.equal(createProgress({ json: true }).enabled, false);
  assert.equal(createProgress({ quiet: true }).enabled, false);
  assert.equal(createProgress({ noProgress: true }).enabled, false);
});
