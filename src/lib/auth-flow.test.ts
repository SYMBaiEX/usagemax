// @vitest-environment node
import { describe, expect, test } from "vitest";
import { authHref, readAuthContext, safeReturnTo, selectAuthProvider } from "./auth-flow";

const original = "https://api.workos.com/user_management/authorize?client_id=client_test&provider=authkit&screen_hint=sign-up&state=sealed-test-state&code_challenge=challenge-test&code_challenge_method=S256&redirect_uri=https%3A%2F%2Fusagemax.com%2Fcallback";
const context = { returnTo: "/account" };

describe("first-party authentication boundaries", () => {
  test.each(["https://evil.test", "//evil.test", "/\\evil.test", "/callback", "/auth/start", "/sign-in", "/account/../auth/start", "/workspace/%2e%2e/api/delete", "/account\n", ["/workspace"], undefined])("rejects unsafe return paths: %s", path => {
    expect(safeReturnTo(path)).toBe("/account");
  });
  test("preserves valid workspace destinations", () => {
    expect(safeReturnTo("/workspace?tab=teams#members")).toBe("/workspace?tab=teams#members");
  });
  test.each([["github", "GitHubOAuth"], ["google", "GoogleOAuth"]] as const)("selects %s without modifying the secure callback or PKCE", (provider, expected) => {
    const url = new URL(selectAuthProvider(original, context, provider));
    expect(url.searchParams.get("provider")).toBe(expected);
    expect(url.searchParams.has("screen_hint")).toBe(false);
    for (const key of ["client_id", "state", "code_challenge", "code_challenge_method", "redirect_uri"]) expect(url.searchParams.get(key)).toBe(new URL(original).searchParams.get(key));
    expect(url.searchParams.has("provider_scopes")).toBe(false);
  });
  test("keeps organization policy flows in AuthKit", () => {
    expect(new URL(selectAuthProvider(original, { ...context, organizationId: "org_test" }, "github")).searchParams.get("provider")).toBe("authkit");
  });
  test("preserves invitations through both page modes and OAuth", () => {
    const context = readAuthContext({ invitation_token: "invite_valid-1", organization_id: "org_test", returnTo: "/workspace" });
    expect(authHref("/sign-up", "sign-up", context)).toContain("invitation_token=invite_valid-1");
    expect(authHref("/auth/hosted", "sign-in", context)).toContain("organization_id=org_test");
    expect(new URL(selectAuthProvider(original, context)).searchParams.get("invitation_token")).toBe("invite_valid-1");
  });
  test("does not accept repeated or malformed context values", () => {
    expect(readAuthContext({ invitation_token: ["a", "b"], organization_id: "../admin" })).toEqual(context);
  });
  test.each([original.replace("api.workos.com", "evil.test"), original.replace("https:", "http:"), original.replace("/user_management/authorize", "/other"), original.replace("state=sealed-test-state", "state="), original.replace("S256", "plain")])("fails closed if the SDK's secure authorization contract changes", url => {
    expect(() => selectAuthProvider(url, context, "github")).toThrow();
  });
});
