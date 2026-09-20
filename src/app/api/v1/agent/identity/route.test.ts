import { beforeEach, describe, expect, it, vi } from "vitest";

const { verify } = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock("@/lib/workos-connect", async () => {
  const actual = await vi.importActual<typeof import("@/lib/workos-connect")>("@/lib/workos-connect");
  return { ...actual, verifyWorkOSDelegatedToken: verify };
});

import { GET, HEAD } from "./route";

describe("delegated agent identity", () => {
  beforeEach(() => verify.mockReset());

  it("requires a bearer token and publishes a protected-resource challenge", async () => {
    const response = await GET(new Request("https://usagemax.com/api/v1/agent/identity"));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("oauth-protected-resource");
    expect(verify).not.toHaveBeenCalled();
  });

  it("returns only the bounded delegated principal projection", async () => {
    verify.mockResolvedValue({
      iss: "https://wholesome-car-48.authkit.app",
      sub: "user_01",
      act: { sub: "user_01" },
      org_id: "org_01",
      client_id: "client_01",
      scope: "openid usage:read",
      exp: 1_800_000_000,
    });
    const response = await GET(new Request("https://usagemax.com/api/v1/agent/identity", {
      headers: { authorization: "Bearer eyJ.test.token" },
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      ok: true,
      credentialType: "workos_connect_delegated",
      tokenReturned: false,
      principal: expect.objectContaining({ subject: "user_01", actorSubject: "user_01", scopes: ["openid", "usage:read"] }),
    }));
  });

  it("keeps HEAD unauthorized without a token", () => {
    expect(HEAD().status).toBe(401);
  });
});
