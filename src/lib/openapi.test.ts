import { describe, expect, it } from "vitest";
import document from "./openapi";

describe("UsageMax OpenAPI contract", () => {
  it("is OpenAPI 3.1 with described, uniquely identified operations", () => {
    expect(document.openapi).toBe("3.1.0");
    const operations = Object.values(document.paths).flatMap((path) =>
      Object.values(path as Record<string, { operationId?: string; description?: string }>),
    );
    const ids = operations.map((operation) => operation.operationId).filter(Boolean);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect(operations.every((operation) => typeof operation.description === "string" && operation.description.length > 0)).toBe(true);
  });

  it("documents the public reads and authenticated CLI limits", () => {
    expect(Object.keys(document.paths)).toEqual(expect.arrayContaining([
      "/api/health", "/api/stats", "/api/leaderboard", "/api/profiles/{handle}",
      "/api/profiles/{handle}/daily", "/api/profiles/{handle}/daily/detail",
      "/api/v1/devices/link", "/api/v1/devices/revoke", "/api/v1/telemetry/llm",
      "/api/v1/traces", "/api/v2/usage/snapshots",
    ]));
    const native = document.paths["/api/v1/telemetry/llm"].post;
    expect(native.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Idempotency-Key", required: true }),
      expect.objectContaining({ name: "x-usagemax-device-id", required: true }),
    ]));
    expect(native.requestBody.content["application/json"].schema).toEqual({ $ref: "#/components/schemas/NativeTelemetryBatch" });
    expect(document.components.schemas.NativeTelemetryBatch.properties.events.maxItems).toBe(100);
    expect(document.components.schemas.NativeTelemetryBatch.properties.events.items.properties.eventKey.maxLength).toBe(180);
    expect(document.paths["/api/v1/devices/link"].post.parameters.find((parameter) => parameter.name === "authorization")?.required).toBe(false);
    expect(document.paths["/api/v1/devices/revoke"].post.security).toEqual([{ collectorBearer: [] }]);
    expect(document.paths["/api/v2/usage/snapshots"].post.requestBody.content["application/json"].schema).toEqual({ $ref: "#/components/schemas/SnapshotOperation" });
  });
});
