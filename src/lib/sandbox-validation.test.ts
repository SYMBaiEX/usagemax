import { describe, expect, it } from "vitest";
import { validateSandboxEvent } from "./sandbox-validation";

const now = Date.parse("2026-09-16T12:00:00.000Z");
const valid = { eventKey: "sandbox-1", model: "example-model", occurredAt: "2026-09-16T11:59:00.000Z" };

describe("sandbox telemetry validation", () => {
  it("accepts the documented minimal event", () => {
    expect(validateSandboxEvent(valid, now)).toBeNull();
  });

  it.each([
    ["timestamp", { occurredAt: "not-a-date" }],
    ["negative counter", { inputTokens: -1 }],
    ["fractional counter", { outputTokens: 1.5 }],
    ["contradictory total", { inputTokens: 10, outputTokens: 10, totalTokens: 1 }],
    ["enum", { status: "wat" }],
    ["schema version", { schemaVersion: 3 }],
    ["future timestamp", { occurredAt: "2026-09-16T12:06:00.000Z" }],
    ["unknown field", { prompt: "never accepted" }],
  ])("rejects malformed %s", (_label, extra) => {
    expect(validateSandboxEvent({ ...valid, ...extra }, now)).toEqual(expect.any(String));
  });
});
