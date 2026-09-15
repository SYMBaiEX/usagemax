export type AuthMode = "sign-in" | "sign-up";
export type SocialProvider = "github" | "google";
export type AuthSearch = Record<string, string | string[] | undefined>;
export type AuthContext = { returnTo: string; invitationToken?: string; organizationId?: string };

export function safeReturnTo(value: unknown): string {
  if (typeof value !== "string" || value.length > 1024 || /[\\\u0000-\u0020]/.test(value)) return "/account";
  // Only authenticated product destinations, never auth endpoints or arbitrary URLs.
  if (!/^\/(account|workspace)(?:[/?#]|$)/.test(value)) return "/account";
  const url = new URL(value, "https://usagemax.com");
  if (!/^\/(account|workspace)(?:\/|$)/.test(url.pathname)) return "/account";
  return `${url.pathname}${url.search}${url.hash}`;
}

export function readAuthContext(search: AuthSearch): AuthContext {
  const invitation = search.invitation_token;
  const organization = search.organization_id;
  return {
    returnTo: safeReturnTo(search.returnTo),
    ...(typeof invitation === "string" && /^[a-zA-Z0-9_-]{1,2048}$/.test(invitation) ? { invitationToken: invitation } : {}),
    ...(typeof organization === "string" && /^org_[a-zA-Z0-9]{1,100}$/.test(organization) ? { organizationId: organization } : {}),
  };
}

export function authHref(path: string, mode: AuthMode, context: AuthContext, provider?: SocialProvider): string {
  const query = new URLSearchParams();
  if (path.startsWith("/auth/")) query.set("mode", mode);
  if (provider) query.set("provider", provider);
  if (context.returnTo !== "/account") query.set("returnTo", safeReturnTo(context.returnTo));
  if (context.invitationToken) query.set("invitation_token", context.invitationToken);
  if (context.organizationId) query.set("organization_id", context.organizationId);
  return `${path}${query.size ? `?${query}` : ""}`;
}

/**
 * AuthKit's Next helper owns PKCE, cookie sealing, and callback verification.
 * Its current public helper hardcodes `provider=authkit`; select a documented
 * OAuth provider on that server-generated API URL without touching state/PKCE.
 * Organization-policy flows remain hosted so discovery/MFA cannot be skipped.
 */
export function selectAuthProvider(generatedUrl: string, context: AuthContext, provider?: SocialProvider): string {
  const url = new URL(generatedUrl);
  if (url.protocol !== "https:" || url.hostname !== "api.workos.com" || url.pathname !== "/user_management/authorize") {
    throw new Error("Unexpected authentication endpoint");
  }
  if (!url.searchParams.get("state") || !url.searchParams.get("code_challenge") || url.searchParams.get("code_challenge_method") !== "S256") {
    throw new Error("Missing authentication protections");
  }
  if (provider && !context.organizationId) {
    url.searchParams.set("provider", provider === "github" ? "GitHubOAuth" : "GoogleOAuth");
    url.searchParams.delete("screen_hint");
  }
  if (context.invitationToken) url.searchParams.set("invitation_token", context.invitationToken);
  return url.toString();
}

export const authErrors: Record<string, string> = {
  cancelled: "Sign-in was cancelled. Choose a provider to try again.",
  expired: "That sign-in session expired. Please start again.",
  verification: "We couldn’t finish sign-in. Try again, or continue with secure verification if your organization requires an extra step.",
  unavailable: "Sign-in is temporarily unavailable. Please try again shortly.",
};
