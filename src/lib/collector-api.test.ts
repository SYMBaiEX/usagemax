import { afterEach, describe, expect, it, vi } from "vitest";

const originalConvexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
const originalFetch = globalThis.fetch;

afterEach(() => {
  if (originalConvexSiteUrl === undefined) delete process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  else process.env.NEXT_PUBLIC_CONVEX_SITE_URL = originalConvexSiteUrl;
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("collector API forwarding", () => {
  it("preserves upstream retry and rate-limit headers on normalized JSON errors", async () => {
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL = "https://collector.example";
    const { forwardCollectorRequest } = await import("./collector-api");
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: "rate_limited" }), {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": "17",
        "ratelimit-policy": "180;w=60, 20000;w=60",
        "ratelimit-limit": "180, 20000",
        "ratelimit-reset": "17, 17",
      },
    }));

    const response = await forwardCollectorRequest(new Request("https://usagemax.com/api/v1/telemetry/llm", {
      method: "POST",
      headers: {
        authorization: `Bearer umx_${"a".repeat(64)}`,
        "content-type": "application/json",
        "content-length": "2",
        "x-usagemax-device-id": "01234567-89ab-4cde-8fab-0123456789ab",
      },
      body: "{}",
    }), { path: "/v1/telemetry/llm", maxBytes: 1024, auth: "required", device: "required", requireJson: true });

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("17");
    expect(response.headers.get("ratelimit-policy")).toBe("180;w=60, 20000;w=60");
    expect(response.headers.get("ratelimit-limit")).toBe("180, 20000");
    expect(response.headers.get("ratelimit-reset")).toBe("17, 17");
    await expect(response.json()).resolves.toMatchObject({ error: "rate_limited", documentation: "https://usagemax.com/docs" });
  });
});
