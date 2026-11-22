import { afterEach, expect, it, vi } from "vitest";

const origin = "https://usagemax.com/api/v1/cli-analytics";
const body = JSON.stringify({
  schemaVersion: 1,
  day: "2026-11-21",
  dailyId: "a".repeat(64),
  cliVersion: "0.3.14",
  platform: "darwin",
  arch: "arm64",
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("forwards a CLI signal without passing the request IP to Convex", async () => {
  vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "https://analytics.convex.site");
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  const { POST } = await import("./route");

  const response = await POST(new Request(origin, {
    method: "POST",
    body,
    headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.1" },
  }));

  expect(response.status).toBe(204);
  const [[url, init]] = fetchMock.mock.calls;
  expect(url).toBe("https://analytics.convex.site/v1/cli-analytics");
  expect(new Headers(init.headers).get("x-forwarded-for")).toBeNull();
  expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe(body);
});

it("rejects credentials and oversized signals before forwarding", async () => {
  vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "https://analytics.convex.site");
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const { POST } = await import("./route");

  for (const credential of ["authorization", "cookie", "x-usagemax-device-id"]) {
    const response = await POST(new Request(origin, {
      method: "POST",
      body,
      headers: { "content-type": "application/json", [credential]: "test-credential" },
    }));
    expect(response.status).toBe(400);
  }
  const oversized = await POST(new Request(origin, {
    method: "POST",
    body: "a".repeat(513),
    headers: { "content-type": "application/json" },
  }));
  expect(oversized.status).toBe(413);
  expect(fetchMock).not.toHaveBeenCalled();
});
