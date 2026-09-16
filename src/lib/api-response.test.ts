import { describe, expect, it } from "vitest";
import { apiError, apiResponse } from "./api-response";

describe("API response contract", () => {
  it("returns a typed documentation reference for JSON errors", async () => {
    const response = apiError("invalid_metric", 400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "invalid_metric",
      message: "The leaderboard metric is not supported.",
      hint: "Use metric=tokens or metric=spend.",
      documentation: "https://usagemax.com/docs",
    });
  });

  it("emits the public policy on errors and honors an explicit collector policy", () => {
    const publicError = apiError("invalid_metric", 400);
    expect(publicError.headers.get("ratelimit-policy")).toBe("60;w=60");
    expect(publicError.headers.get("ratelimit-limit")).toBe("60");
    expect(publicError.headers.get("ratelimit-reset")).toBe("60");

    const response = apiError("rate_limited", 429, undefined, { limit: 180, windowSeconds: 60 });
    expect(response.headers.get("ratelimit-policy")).toBe("180;w=60");
    expect(response.headers.get("ratelimit-limit")).toBe("180");
    expect(response.headers.get("ratelimit-reset")).toBe("60");
    expect(response.headers.get("retry-after")).toBe("60");
    expect(response.headers.get("ratelimit-remaining")).toBeNull();
  });

  it("publishes the bounded public-read policy without claiming a remaining count", () => {
    const response = apiResponse({ ok: true });
    expect(response.headers.get("ratelimit-policy")).toBe("60;w=60");
    expect(response.headers.get("ratelimit-limit")).toBe("60");
    expect(response.headers.get("ratelimit-reset")).toBe("60");
    expect(response.headers.get("ratelimit-remaining")).toBeNull();
  });
});
