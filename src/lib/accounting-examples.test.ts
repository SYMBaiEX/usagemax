import { describe, expect, test } from "vitest";
import { accountingExamples } from "./accounting-examples";

describe("public accounting examples", () => {
  test.each(Object.values(accountingExamples))("$label keeps its buckets equal to the reported total", (example) => {
    expect(example.input + example.output + example.unclassified).toBe(example.total);
    expect(example.total).toBe(example.payload.totalTokens);
    expect(example.added).toBeLessThanOrEqual(example.total);
    expect(example.payload).not.toHaveProperty("costMicros");
  });

  test("missing output is retained as unclassified, not invented", () => {
    const example = accountingExamples.partial;
    expect(example.payload).not.toHaveProperty("outputTokens");
    expect(example.output).toBe(0);
    expect(example.unclassified).toBe(800);
    expect(example.added).toBe(2000);
  });

  test("an exact event replay adds no tokens", () => {
    expect(accountingExamples.replay.payload).toEqual(accountingExamples.complete.payload);
    expect(accountingExamples.replay.added).toBe(0);
    expect(accountingExamples.replay.total).toBe(2000);
  });
});
