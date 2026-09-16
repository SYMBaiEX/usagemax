// @vitest-environment node
import type { AnchorHTMLAttributes } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { AuthPage } from "./auth-page";
import { SiteFrame } from "./site-frame";
import { AuthSculpture } from "./auth-sculpture";
const state = vi.hoisted(() => ({ path: "/sign-in" }));
vi.mock("next/link", () => ({ default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} /> }));
vi.mock("next/navigation", () => ({ usePathname: () => state.path }));
vi.mock("@workos-inc/authkit-nextjs/components", () => ({ useAuth: () => ({ user: null, loading: false }) }));

describe("UsageMax auth pages", () => {
  test.each(["sign-in", "sign-up"] as const)("%s renders theme-aware, accessible first-party provider choices", mode => {
    const html = renderToStaticMarkup(<AuthPage mode={mode} context={{ returnTo: "/account" }} />);
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain(`data-auth-page="${mode}"`);
    expect(html).toContain("Continue with GitHub");
    expect(html).toContain("Continue with Google");
    expect(html).toContain("Continue with SSO");
    expect(html).toContain(`/auth/start?mode=${mode}&amp;provider=github`);
    expect(html).toContain("Switch to dark theme");
    expect(html).not.toContain("Pause ambient animation");
    expect(html).not.toContain("Enable ambient animation");
    expect(html).not.toContain("UsageMax / Studio");
    expect(html).not.toContain("UsageMax / Signal");
    expect(html).not.toContain("001 — ∞");
    expect(html).not.toContain("Built in the open.");
    expect(html).not.toContain("authkit.app");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<canvas");
    expect(html).not.toContain("type=\"password\"");
  });
  test("sculpture uses a larger center mark without floating tags", () => {
    const html = renderToStaticMarkup(<AuthSculpture />);
    expect(html).toContain('width="64"');
    expect(html).toContain('height="64"');
    expect(html).not.toMatch(/>models<|>computers<|>you</);
  });
  test("sign-in omits the extra greeting and connected-computer copy", () => {
    const html = renderToStaticMarkup(<AuthPage mode="sign-in" context={{ returnTo: "/account" }} />);
    expect(html).not.toContain("Pick up where you left off");
    expect(html).not.toContain("Same account. Every connected computer.");
    expect(html).toContain("Welcome");
    expect(html).toContain("Continue with GitHub");
  });
  test("sign-up keeps clear privacy and legal links", () => {
    const html = renderToStaticMarkup(<AuthPage mode="sign-up" context={{ returnTo: "/account" }} />);
    expect(html).toContain("Free for individuals");
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain("Private by default");
  });
  test("only known error text can appear, with secure verification recovery", () => {
    const props = { mode: "sign-in" as const, context: { returnTo: "/account" } };
    expect(renderToStaticMarkup(<AuthPage {...props} error="verification" />)).toContain("Continue with secure verification");
    expect(renderToStaticMarkup(<AuthPage {...props} error="untrusted_error" />)).not.toContain("untrusted_error");
    expect(renderToStaticMarkup(<AuthPage {...props} error="toString" />)).not.toContain('role="alert"');
  });
  test("auth pages have dedicated chrome; product pages retain their existing header/footer", () => {
    state.path = "/sign-up";
    const frame = <SiteFrame header="PRODUCT HEADER" footer="PRODUCT FOOTER">PAGE CONTENT</SiteFrame>;
    expect(renderToStaticMarkup(frame)).not.toContain("PRODUCT HEADER");
    state.path = "/workspace";
    expect(renderToStaticMarkup(frame)).toContain("PRODUCT HEADER");
    expect(renderToStaticMarkup(frame)).toContain("PRODUCT FOOTER");
  });
});
