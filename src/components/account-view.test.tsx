// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import type { AnchorHTMLAttributes } from "react";
import { getFunctionName } from "convex/server";
import { describe, expect, test, vi } from "vitest";
import { AccountView } from "./account-view";

const fixture = vi.hoisted(() => ({
  account: {
    user: { name: "Ada", email: "ada@example.com", avatarUrl: null },
    workspace: { name: "Ada", kind: "personal", role: "owner" },
    capabilities: {
      "workspace:delete": true,
      "profile:manage": true,
      "collectors:manage": true,
      "collectors:self": true,
      "data:export": true,
      "audit:read": false,
    },
    profile: {
      handle: "ada",
      displayName: "Ada",
      bio: "",
      avatarUrl: null,
      isPublic: false,
      isVerified: false,
    },
    collectors: [],
    connectedSources: [],
    coverage: null,
    deletionRequest: {
      requestedAt: 1,
      scheduledFor: 2,
      waitingForBillingCancellation: true,
      billingCancellationConfirmed: false,
      billingPortalAvailable: true,
    },
  },
}));

vi.mock("next/link", () => ({
  default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
}));
vi.mock("@workos-inc/authkit-nextjs/components", () => ({
  useAuth: () => ({ signOut: vi.fn() }),
}));
vi.mock("convex/react", () => ({
  AuthLoading: () => null,
  Authenticated: ({ children }: { children: React.ReactNode }) => children,
  Unauthenticated: () => null,
  useAction: () => vi.fn(),
  useMutation: () => vi.fn(),
  useQuery: (reference: Parameters<typeof getFunctionName>[0] | "skip") =>
    reference === "skip"
      ? undefined
      : getFunctionName(reference) === "account:current"
        ? fixture.account
        : undefined,
  usePaginatedQuery: () => ({ results: [], status: "Exhausted", loadMore: vi.fn() }),
}));

describe("account deletion billing hold", () => {
  test("explains the pause and links to billing without implying deletion is complete", () => {
    const html = renderToStaticMarkup(<AccountView />);
    expect(html).toContain("Deletion is paused until billing is resolved.");
    expect(html).toContain("UsageMax will not cancel the subscription for you.");
    expect(html).toContain('action="/api/billing/portal"');
    expect(html).toContain(">Manage billing</button>");
    expect(html).toContain("Cancel deletion and restore collectors");
    expect(html).not.toContain("Hard deletion is scheduled");
  });
  test("reports cancellation confirmation as still in progress", () => {
    fixture.account.deletionRequest.waitingForBillingCancellation = false;
    fixture.account.deletionRequest.billingCancellationConfirmed = true;
    const html = renderToStaticMarkup(<AccountView />);
    expect(html).toContain("Billing is canceled or inactive.");
    expect(html).toContain("Account deletion is still in progress");
    expect(html).not.toContain('action="/api/billing/portal"');
    fixture.account.deletionRequest.waitingForBillingCancellation = true;
    fixture.account.deletionRequest.billingCancellationConfirmed = false;
  });
});
