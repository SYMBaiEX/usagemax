import { beforeEach, describe, expect, it, vi } from "vitest";

const { verify, fetchQuery } = vi.hoisted(() => ({ verify: vi.fn(), fetchQuery: vi.fn() }));
vi.mock("@/lib/workos-connect", async () => {
  const actual = await vi.importActual<typeof import("@/lib/workos-connect")>("@/lib/workos-connect");
  return { ...actual, verifyWorkOSDelegatedToken: verify };
});
vi.mock("convex/nextjs", () => ({ fetchQuery }));

import { GET } from "./route";

describe("delegated workspace overview", () => {
  beforeEach(() => {
    verify.mockReset();
    fetchQuery.mockReset();
  });

  it("requires the usage:read scope", async () => {
    verify.mockResolvedValue({ sub: "user_01", scope: "openid profile" });
    const response = await GET(new Request("https://usagemax.com/api/v1/agent/workspace", { headers: { authorization: "Bearer eyJ.test.token" } }));
    expect(response.status).toBe(403);
    expect(fetchQuery).not.toHaveBeenCalled();
  });

  it("uses the delegated bearer as the Convex identity and returns read-only data", async () => {
    verify.mockResolvedValue({ sub: "user_01", scope: "openid usage:read", iss: "https://wholesome-car-48.authkit.app" });
    fetchQuery.mockResolvedValue({ workspace: { id: "ws_01", name: "Acme" }, capabilities: { "data:export": false } });
    const response = await GET(new Request("https://usagemax.com/api/v1/agent/workspace", { headers: { authorization: "Bearer eyJ.test.token" } }));
    expect(response.status).toBe(200);
    expect(fetchQuery).toHaveBeenCalledWith(expect.anything(), {}, { token: "eyJ.test.token" });
    await expect(response.json()).resolves.toMatchObject({ ok: true, readOnly: true, workspace: { workspace: { name: "Acme" } } });
  });
});
