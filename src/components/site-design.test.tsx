// @vitest-environment node
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { DocsView, EnterpriseView, MethodologyView, PrivacyView, SecurityView, TermsView } from "./content-pages";
import { PageIntro, SiteHeader } from "./site-shell";
import { AccountView } from "./account-view";
import NotFound from "../app/not-found";

const state = vi.hoisted(() => ({ path: "/docs", account: undefined as unknown, authenticated: true }));
vi.mock("next/link", () => ({ default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} /> }));
vi.mock("next/navigation", () => ({ usePathname: () => state.path }));
vi.mock("@workos-inc/authkit-nextjs/components", () => ({ useAuth: () => ({ user: null, loading: false, signOut: vi.fn() }) }));
vi.mock("convex/react", () => ({
  useQuery: (_query: unknown, args: unknown) => args === "skip" ? undefined : state.account,
  useMutation: () => vi.fn(), useAction: () => vi.fn(),
  usePaginatedQuery: () => ({ results: [], status: "LoadingFirstPage", loadMore: vi.fn() }),
  Authenticated: ({ children }: { children: ReactNode }) => state.authenticated ? children : null,
  Unauthenticated: ({ children }: { children: ReactNode }) => state.authenticated ? null : children,
  AuthLoading: () => null,
}));

function accountFixture(capabilities: Record<string, boolean>, hasProfile = true) {
  return {
    user: { name: "Test Builder", email: "builder@example.test" },
    workspace: { name: "Test workspace", kind: "personal", role: "owner" },
    profile: hasProfile ? { handle: "test-builder", displayName: "Test Builder", bio: "A private test fixture", isPublic: false } : null,
    collectors: [{ id: "collector-test", name: "A computer with a deliberately long display name", platform: "darwin", keyPrefix: "umx_test", lastSuccessAt: 1789400000000, cliVersion: "0.3.0" }],
    connectedSources: ["codex", "claude"], capabilities, coverage: null, deletionRequest: null,
  };
}

describe("site design and behavior boundaries", () => {
  beforeEach(() => { state.path = "/docs"; state.authenticated = true; state.account = undefined; });

  test.each([DocsView, EnterpriseView, MethodologyView, PrivacyView, SecurityView, TermsView])("content view has one heading and no placeholder controls (%#)", (View) => {
    const html = renderToStaticMarkup(<View />);
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).not.toContain('href="#"');
    expect(html).not.toContain("READ / COPY");
  });

  test("navigation marks the current destination and preserves document sign-in", () => {
    const html = renderToStaticMarkup(<SiteHeader />);
    expect(html).toContain('aria-current="page" href="/docs"');
    expect(html).toContain('href="/sign-in"');
    expect(html).toContain('aria-label="Mobile navigation"');
  });

  test("documentation has real copy controls and valid section anchors", () => {
    const html = renderToStaticMarkup(<DocsView />);
    expect(html.match(/aria-label="Copy code"/g)).toHaveLength(3);
    for (const anchor of ["quickstart", "event-contract", "open-telemetry", "public-surface"]) {
      expect(html).toContain(`href="#${anchor}"`);
      expect(html).toContain(`id="${anchor}"`);
    }
  });

  test.each([
    [DocsView, "Documentation"], [EnterpriseView, "UsageMax for teams"],
    [MethodologyView, "How we count"], [SecurityView, "Security"],
    [PrivacyView, "Privacy policy"], [TermsView, "Terms of service"],
  ] as const)("content pages use a direct title without an introductory pitch (%#)", (View, title) => {
    const html = renderToStaticMarkup(<View />);
    expect(html).toContain(`<h1>${title}</h1>`);
    expect(html).not.toContain('class="page-intro-description"');
    expect(html).not.toContain('class="methodology-quote"');
  });

  test("a title without actions does not leave empty intro wrappers", () => {
    const html = renderToStaticMarkup(<PageIntro title="Documentation" />);
    expect(html).not.toContain('class="page-intro-actions"');
    expect(html).not.toContain('class="eyebrow"');
  });

  test("shorter methodology preserves cost and completeness caveats", () => {
    const html = renderToStaticMarkup(<MethodologyView />);
    expect(html).toContain("Missing prices remain unknown");
    expect(html).toContain("the remainder stays unclassified");
    expect(html).toContain("Observability-only heartbeats do not alter accounting totals");
  });

  test("read-only account cannot gain management controls through the new layout", () => {
    state.account = accountFixture({});
    const html = renderToStaticMarkup(<AccountView />);
    expect(html).toContain('aria-label="Workspace sections"');
    expect(html).toContain("Read-only access");
    expect(html).not.toContain("Generate link command");
    expect(html).not.toContain("Make public");
    expect(html).not.toContain("Create API key");
    expect(html).not.toContain("Schedule deletion");
  });

  test("owner account retains actions and all sidebar targets", () => {
    state.account = accountFixture({ "profile:manage": true, "collectors:manage": true, "data:export": true, "workspace:delete": true, "audit:read": true });
    const html = renderToStaticMarkup(<AccountView />);
    for (const anchor of ["overview", "account-profile", "link-computer", "account-devices", "account-coverage"]) expect(html).toContain(`id="${anchor}"`);
    for (const action of ["Generate link command", "Make public", "Download workspace data", "Schedule deletion", "Workspace audit trail"]) expect(html).toContain(action);
    expect(html).toContain("A computer with a deliberately long display name");
  });

  test("new account shows only available navigation targets", () => {
    state.account = accountFixture({}, false);
    const html = renderToStaticMarkup(<AccountView />);
    expect(html).toContain("Choose your UsageMax handle");
    expect(html).not.toContain('href="#account-devices"');
    expect(html).toContain('href="#overview"');
  });

  test("unavailable and signed-out account states stay readable", () => {
    expect(renderToStaticMarkup(<AccountView />)).toContain("Loading your workspace");
    state.authenticated = false;
    expect(renderToStaticMarkup(<AccountView />)).toContain("Continue to secure sign in");
    expect(renderToStaticMarkup(<NotFound />)).toContain("Back to UsageMax");
  });
});
