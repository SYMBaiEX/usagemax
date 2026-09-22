// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { readFileSync, writeFileSync } from "node:fs";
import type { AnchorHTMLAttributes } from "react";
import { Workspace, Ledger, Teams, Budgets } from "./workspace-view";

const fixture = vi.hoisted(() => ({
  enterprise: false,
  candidateStatus: "Exhausted" as "Exhausted" | "CanLoadMore" | "LoadingFirstPage",
  candidateResults: [] as { userId: string; name: string; email: string }[],
  projectStatus: "Exhausted" as "Exhausted" | "CanLoadMore" | "LoadingFirstPage",
  projectResults: [] as {
    _id: string;
    name: string;
    key: string;
    costCenter: string;
    teamId?: string;
    archivedAt?: number;
  }[],
  overview: {
    workspace: {
      id: "workspace_fixture",
      name: "Platform engineering",
      organizationId: "org_fixture",
      retentionDays: 30,
    },
    userId: "user_fixture",
    policy: {
      enterprise: false,
      tier: "free",
      members: 10,
      teams: 5,
      devices: 25,
    },
    capabilities: {
      "finance:read": true,
      "finance:manage": true,
      "members:manage": true,
      "teams:manage": true,
      "workspace:manage": true,
      "audit:read": true,
      "integrations:manage": true,
    },
    teams: [
      {
        _id: "team_platform",
        name: "Platform",
        description: "Agent infrastructure",
      },
      {
        _id: "team_product",
        name: "Product",
        description: "Customer experiences",
      },
      {
        _id: "team_archived",
        name: "Archived team",
        description: "Historical team",
        archivedAt: 1,
      },
    ],
    projects: [
      {
        _id: "project_1",
        name: "Developer tools",
        key: "devtools",
        costCenter: "R&D",
        teamId: "team_platform",
      },
    ],
  },
}));
vi.mock("next/link", () => ({
  default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
}));
vi.mock("./workspace.module.css", () => ({
  default: new Proxy({}, { get: (_, key) => String(key) }),
}));
vi.mock("@workos-inc/authkit-nextjs/components", () => ({
  useAuth: () => ({ switchToOrganization: vi.fn() }),
}));
vi.mock("convex/react", () => ({
  Authenticated: ({ children }: { children: React.ReactNode }) => children,
  AuthLoading: () => null,
  Unauthenticated: () => null,
  useAction: () => vi.fn(),
  useMutation: () => vi.fn(),
  useQuery: (reference: Parameters<typeof getFunctionName>[0]) => {
    switch (getFunctionName(reference)) {
      case "workspaces:overview":
        return {
          ...fixture.overview,
          policy: {
            ...fixture.overview.policy,
            enterprise: fixture.enterprise,
          },
        };
      case "workspaces:list":
        return [
          {
            id: "workspace_fixture",
            name: "Platform engineering",
            organizationId: "org_fixture",
          },
        ];
      case "personal:preferences":
        return {
          timezone: "UTC",
          weekStartsOn: "monday",
          defaultRange: "all",
          notificationBudgets: true,
          notificationCoverage: true,
        };
      case "personal:summary":
        return {
          stats: {
            totalTokens: 104_882_412_911,
            totalCostMicros: 28_938_140_000,
            activeDays: 243,
            deviceCount: 3,
            firstDay: "2024-02-11",
            sessionCoverage: "partial",
            sources: ["claude", "codex", "cursor"],
          },
          models: ["claude-opus-4-6", "gpt-5.6-sol", "claude-sonnet-4-6"].map(
            (model, i) => ({ _id: String(i), model }),
          ),
        };
      case "personal:savedViews":
        return [];
      case "finance:summary":
        return {
          explanation:
            "Estimated, reported and billed amounts are separate views, not amounts to add together.",
          totals: [
            {
              _id: "total",
              basis: "reported",
              currency: "USD",
              amountMicros: 948_450_000,
            },
          ],
        };
      case "finance:reconciliation":
        return {
          status: "needs_review",
          billedMicros: 980_000_000,
          reportedMicros: 948_450_000,
          differenceMicros: 31_550_000,
          note: "Subscriptions and credits can explain differences. Review the invoice evidence.",
        };
      case "budgets:list":
        return [
          {
            _id: "budget_1",
            name: "September research",
            observedMicros: 748_000_000,
            limitMicros: 1_000_000_000,
            currency: "USD",
            source: "tracked",
            basis: "estimated",
            thresholdPercent: 80,
            enabled: true,
            evaluatedAt: 1789426800000,
          },
        ];
      default:
        return [];
    }
  },
  usePaginatedQuery: (reference: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(reference);
    const results =
      name === "personal:usage"
        ? [
            "claude-opus-4-6",
            "gpt-5.6-sol",
            "claude-sonnet-4-6",
            "gemini-2.5-pro",
            "gpt-5.6-sol",
            "claude-opus-4-6",
          ].map((model, i) => ({
            _id: String(i),
            day: "2026-09-14",
            model,
            source: i % 2 ? "codex" : "claude",
            totalTokens: 1_860_331 + i * 220_000,
            costMicros: 8_250_000 + i * 1_250_000,
            costBasis: "estimated",
            requests: 14 + i,
          }))
        : name === "workspaces:members"
          ? [
              {
                id: "member_1",
                userId: "user_fixture",
                name: "Alex Chen",
                email: "alex@example.com",
                role: "owner",
                status: "active",
                source: "workos",
              },
            ]
          : name === "finance:entries"
            ? [
                {
                  _id: "entry_1",
                  day: "2026-09-14",
                  provider: "anthropic",
                  account: "Production",
                  basis: "reported",
                  amountMicros: 948_450_000,
                  currency: "USD",
                  kind: "usage",
                  source: "provider",
                  projectId: "project_1",
                },
              ]
            : [];
    return {
      results:
        name === "workspaces:teamCandidates"
          ? fixture.candidateResults
          : name === "workspaces:projects"
            ? fixture.projectResults
            : results,
      status:
        name === "workspaces:teamCandidates"
          ? fixture.candidateStatus
          : name === "workspaces:projects"
            ? fixture.projectStatus
            : "Exhausted",
      loadMore: vi.fn(),
    };
  },
}));

describe("workspace product surfaces", () => {
  test("free workspace opens the overview without showing paid connections", () => {
    fixture.enterprise = false;
    const html = renderToStaticMarkup(<Workspace />);
    expect(html).toContain("Free workspace");
    expect(html).toContain('aria-label="Your usage summary"');
    expect(html).toContain("104.88B");
    expect(html).toContain("not an invoice");
    expect(html).toContain("Usage reports");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Personal workspace");
    expect(html).not.toContain(">Connections</button>");
    expect(html).not.toContain("credential");
  });
  test("enterprise exposes its connections tab and form labels", () => {
    fixture.enterprise = true;
    const overview = fixture.overview as unknown as Parameters<
      typeof Teams
    >[0]["overview"];
    const html = renderToStaticMarkup(
      <>
        <Workspace />
        <Teams overview={overview} />
      </>,
    );
    expect(html).toContain(">Connections</button>");
    expect(html).toContain('aria-label="Workspace sections"');
    expect(html).toContain('scope="col"');
  });
  test("team management opens the active team and explains empty membership states", () => {
    const overview = fixture.overview as unknown as Parameters<
      typeof Teams
    >[0]["overview"];
    const html = renderToStaticMarkup(<Teams overview={overview} />);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Edit team settings");
    expect(html).toContain("This team has no active members yet.");
    expect(html).toContain("Invitations will appear here after you send one.");
    expect(html).toContain("Projects &amp; cost centers");
  });
  test("team assignment controls follow the team's management capabilities", () => {
    const overview = {
      ...fixture.overview,
      capabilities: {
        ...fixture.overview.capabilities,
        "teams:manage": false,
      },
    } as unknown as Parameters<typeof Teams>[0]["overview"];
    const html = renderToStaticMarkup(<Teams overview={overview} />);
    expect(html).not.toContain("Add to team");

    const managerOnly = {
      ...fixture.overview,
      capabilities: {
        ...fixture.overview.capabilities,
        "members:manage": false,
        "teams:manage": true,
      },
    } as unknown as Parameters<typeof Teams>[0]["overview"];
    fixture.candidateResults = [
      {
        userId: "user_candidate",
        name: "Priya Shah",
        email: "priya@example.com",
      },
    ];
    const managerHtml = renderToStaticMarkup(<Teams overview={managerOnly} />);
    expect(managerHtml).toContain("Add to team");
    expect(managerHtml).not.toContain("Team manager");
    expect(managerHtml).toContain("Priya Shah · priya@example.com");
    fixture.candidateResults = [];
  });
  test("project pages and sparse team-candidate pages keep pagination available", () => {
    fixture.projectStatus = "CanLoadMore";
    fixture.projectResults = [
      {
        _id: "project_research",
        name: "Research portal",
        key: "research",
        costCenter: "R&D",
        teamId: "team_platform",
      },
    ];
    fixture.candidateStatus = "CanLoadMore";
    fixture.candidateResults = [];
    const overview = fixture.overview as unknown as Parameters<
      typeof Teams
    >[0]["overview"];
    const html = renderToStaticMarkup(<Teams overview={overview} />);
    expect(html).toContain("Research portal");
    expect(html).toContain("No eligible members on this page; load more below");
    expect(html.match(/>Load more<\/button>/g)).toHaveLength(2);
    fixture.projectStatus = "Exhausted";
    fixture.projectResults = [];
    fixture.candidateStatus = "Exhausted";
  });
  test("archived teams are absent from invite options and projects expose an edit lifecycle", () => {
    const overview = fixture.overview as unknown as Parameters<
      typeof Teams
    >[0]["overview"];
    const inviteHtml = renderToStaticMarkup(<Teams overview={overview} />);
    expect(inviteHtml).toContain('<option value="team_platform">Platform</option>');
    expect(inviteHtml).toContain('<option value="team_product">Product</option>');
    expect(inviteHtml).not.toContain('<option value="team_archived">');

    fixture.projectResults = [
      {
        _id: "project_editable",
        name: "Research portal",
        key: "research",
        costCenter: "R&D",
        teamId: "team_platform",
      },
    ];
    const projectHtml = renderToStaticMarkup(<Teams overview={overview} />);
    expect(projectHtml).toContain("Edit or archive");
    expect(projectHtml).toContain("Archive this project");
    expect(projectHtml).toContain("Team: Platform");
    expect(projectHtml).toContain("Save project");
    expect(projectHtml).not.toContain('<option value="team_archived">');
    fixture.projectResults = [];
  });
  test("archived project team history is visible but cannot be reassigned from the picker", () => {
    fixture.projectResults = [
      {
        _id: "project_archived_team",
        name: "Legacy service",
        key: "legacy",
        costCenter: "R&D",
        teamId: "team_archived",
      },
    ];
    const overview = fixture.overview as unknown as Parameters<
      typeof Teams
    >[0]["overview"];
    const html = renderToStaticMarkup(<Teams overview={overview} />);
    expect(html).toContain("Team: Archived team (archived)");
    expect(html).toContain('value="keep-archived:team_archived"');
    expect(html).toContain("Keep current: Archived team (archived)");
    expect(html).not.toContain('<option value="team_archived">');
    expect(html).toContain('<option value="team_platform">Platform</option>');
    fixture.projectResults = [];
  });
  test("finance-only users can inspect projects but cannot edit their lifecycle", () => {
    fixture.projectResults = [
      {
        _id: "project_finance_readonly",
        name: "Finance report",
        key: "finance-report",
        costCenter: "Finance",
        teamId: "team_platform",
      },
    ];
    const overview = {
      ...fixture.overview,
      capabilities: {
        ...fixture.overview.capabilities,
        "members:manage": false,
        "teams:manage": false,
        "finance:read": true,
      },
    } as unknown as Parameters<typeof Teams>[0]["overview"];
    const html = renderToStaticMarkup(<Teams overview={overview} />);
    expect(html).toContain("Finance report");
    expect(html).toContain("Team: Platform");
    expect(html).not.toContain("Edit or archive");
    expect(html).not.toContain("Archive this project");
    expect(html).not.toContain("Save project");
    fixture.projectResults = [];
  });
  test("project and candidate initial loading states do not look empty", () => {
    fixture.projectStatus = "LoadingFirstPage";
    fixture.candidateStatus = "LoadingFirstPage";
    const overview = fixture.overview as unknown as Parameters<
      typeof Teams
    >[0]["overview"];
    const html = renderToStaticMarkup(<Teams overview={overview} />);
    expect(html).toContain("Loading projects…");
    expect(html).toContain("Loading eligible members…");
    expect(html).not.toContain(
      "Add a project to connect teams with cost centers.",
    );
    fixture.projectStatus = "Exhausted";
    fixture.candidateStatus = "Exhausted";
  });
  test("renders representative light/dark layout fixtures when explicitly requested", () => {
    const directory = process.env.USAGEMAX_VISUAL_DIR;
    if (!directory) return;
    const css = readFileSync(
      new URL("./workspace.module.css", import.meta.url),
      "utf8",
    ).replaceAll(/:global\(([^)]+)\)/g, "$1");
    const globals = readFileSync(
      new URL("../app/globals.css", import.meta.url),
      "utf8",
    ).replace('@import "tailwindcss";', "");
    const themes = readFileSync(
      new URL("../app/themes.css", import.meta.url),
      "utf8",
    );
    fixture.enterprise = true;
    // Deliberately synthetic presentation fixture; no auth bypass or fixture route ships.
    const overview = fixture.overview as unknown as Parameters<
      typeof Teams
    >[0]["overview"];
    const markup = renderToStaticMarkup(
      <>
        <div className="shell workspace">
          <Workspace />
        </div>
        <div className="shell body">
          <Teams overview={overview} />
          <Ledger overview={overview} />
          <Budgets editable />
        </div>
      </>,
    );
    for (const theme of ["light", "dark"])
      writeFileSync(
        `${directory}/${theme}.html`,
        `<!doctype html><html data-theme="${theme}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UsageMax layout fixture — ${theme}</title><style>${globals}\n${themes}\n${css}\n:root{--font-sans:Arial,sans-serif;--font-mono:monospace}</style><body><p style="padding:12px 48px">Layout fixture · synthetic data · no live actions</p>${markup}</body></html>`,
      );
    expect(markup).toContain("September research");
  });
});
