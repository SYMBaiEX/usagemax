import { afterEach, expect, test, vi } from "vitest";
import { createGatewayClient, GatewayError } from "../../packages/gateway-client/src/client";
import { forwardGatewayRequest } from "./gateway-api";

const key = `umxg_${"b".repeat(64)}`;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("gateway facade restricts auth and forwards only the private gateway bearer", async () => {
  vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "https://convex.example");
  const send = vi.fn(async (_url: URL, _init?: RequestInit) => new Response(JSON.stringify({ error: "gateway_scope_required" }), {
    status: 403, headers: { "content-type": "application/json" },
  }));
  vi.stubGlobal("fetch", send);
  const origin = "https://usagemax.com/api/v1/gateway/receipts";
  const path = "/v1/gateway/receipts";
  const unauthenticated = await forwardGatewayRequest(new Request(origin), path);
  expect(unauthenticated.status).toBe(401);
  expect(send).not.toHaveBeenCalled();
  const result = await forwardGatewayRequest(new Request(origin, {
    headers: { authorization: `Bearer ${key}`, cookie: "ignore=test" },
  }), path);
  expect(result.status).toBe(403);
  const [[url, init]] = send.mock.calls;
  expect(url.href).toBe("https://convex.example/v1/gateway/receipts");
  expect(new Headers(init?.headers).has("cookie")).toBe(false);
  expect(result.headers.get("cache-control")).toBe("private, no-store");
});

test("the TypeScript client sends a bounded report query and exposes retry guidance", async () => {
  const fetchImpl = vi.fn(async (_url: URL | Request | string, _options?: RequestInit) =>
    new Response(null, { status: 429, headers: { "retry-after": "9" } }));
  const client = createGatewayClient({ token: key, fetchImpl });
  const query = client.report({ from: "2026-11-21", through: "2026-11-21", limit: 10 });
  await expect(query).rejects.toBeInstanceOf(GatewayError);
  await expect(query).rejects.toMatchObject({ status: 429, retryAfter: "9" });
  const [[url, options]] = fetchImpl.mock.calls;
  expect(String(url)).toBe("https://usagemax.com/api/v1/gateway/receipts?from=2026-11-21&through=2026-11-21&limit=10");
  expect(new Headers(options?.headers).get("authorization")).toBe(`Bearer ${key}`);
  expect(options?.redirect).toBe("error");
});
