// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as start } from "@/app/auth/start/route";
import { GET as hosted } from "@/app/auth/hosted/route";
import { GET as callback } from "@/app/callback/route";

const mocks = vi.hoisted(() => ({ signIn: vi.fn(), signUp: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@workos-inc/authkit-nextjs", () => ({
  getSignInUrl: mocks.signIn, getSignUpUrl: mocks.signUp,
  handleAuth: (options: { onError: (data: { request: NextRequest }) => Response }) => (request: NextRequest) => options.onError({ request }),
}));
const secureUrl = "https://api.workos.com/user_management/authorize?provider=authkit&state=test-state&code_challenge=test-challenge&code_challenge_method=S256";

describe("authentication route behavior", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.signIn.mockResolvedValue(secureUrl); mocks.signUp.mockResolvedValue(secureUrl); });
  test("GET route chooses direct GitHub rather than treating Next route context as hosted", async () => {
    const response = await start(new NextRequest("https://usagemax.com/auth/start?provider=github"));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("provider=GitHubOAuth");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
  test("sign-up uses the sign-up helper and Google selection", async () => {
    const response = await start(new NextRequest("https://usagemax.com/auth/start?provider=google&mode=sign-up&returnTo=/workspace"));
    expect(mocks.signUp).toHaveBeenCalledWith({ returnTo: "/workspace", organizationId: undefined });
    expect(response.headers.get("location")).toContain("provider=GoogleOAuth");
  });
  test("unsupported providers cannot initiate authentication", async () => {
    const response = await start(new NextRequest("https://usagemax.com/auth/start?provider=evil"));
    expect(response.status).toBe(400);
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
  test.each<Record<string, string>>([{ rsc: "1" }, { purpose: "prefetch" }, { "sec-purpose": "prefetch;prerender" }])("prefetch does not generate PKCE cookies", async headers => {
    expect((await start(new NextRequest("https://usagemax.com/auth/start?provider=github", { headers }))).status).toBe(204);
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
  test("SSO and initiate-login continue through hosted policy checks", async () => {
    const response = await hosted(new NextRequest("https://usagemax.com/auth/hosted?organization_id=org_example&invitation_token=invite_123"));
    expect(mocks.signIn).toHaveBeenCalledWith({ returnTo: "/account", organizationId: "org_example" });
    expect(response.headers.get("location")).toContain("provider=authkit");
    expect(response.headers.get("location")).toContain("invitation_token=invite_123");
  });
  test("SDK errors return a safe on-site retry without secret details", async () => {
    mocks.signIn.mockRejectedValue(new Error("sensitive-provider-error"));
    const response = await start(new NextRequest("https://usagemax.com/auth/start?provider=github"));
    expect(response.headers.get("location")).toBe("https://usagemax.com/sign-in?error=unavailable");
    expect(await response.text()).not.toContain("sensitive-provider-error");
  });
  test("cancelled callbacks land on our error UI", async () => {
    const response = await callback(new NextRequest("https://usagemax.com/callback?error=access_denied&error_description=untrusted"));
    expect(response.headers.get("location")).toBe("https://usagemax.com/sign-in?error=cancelled");
  });
  test("temporary errors preserve validated invitation and return context", async () => {
    mocks.signIn.mockRejectedValue(new Error("unavailable"));
    const response = await start(new NextRequest("https://usagemax.com/auth/start?provider=github&returnTo=/workspace&invitation_token=invite_123&organization_id=org_example"));
    const destination = new URL(response.headers.get("location")!);
    expect(destination.pathname).toBe("/sign-in");
    expect(destination.searchParams.get("returnTo")).toBe("/workspace");
    expect(destination.searchParams.get("invitation_token")).toBe("invite_123");
    expect(destination.searchParams.get("organization_id")).toBe("org_example");
    expect(destination.searchParams.get("error")).toBe("unavailable");
  });
});
