// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { getFunctionName, type FunctionReturnType } from "convex/server";
import type { ReactNode, AnchorHTMLAttributes } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { api } from "../../convex/_generated/api";
import { aggregateGateway } from "../../convex/gatewayMetrics";
import { GatewayWorkspace } from "./gateway-workspace";

const fixture = vi.hoisted(() => ({
  capabilities: { "finance:read": true, "collectors:manage": false },
  projects: [{ _id: "project1", name: "Production gateway" }],
  linkedProject: null as { _id: string; name: string } | null,
  evals: { runs: [] } as FunctionReturnType<typeof api.gatewayEvals.list>,
  receipt: {
    requestId: "request:123",
    revision: 1,
    schemaVersion: 1 as const,
    model: "example",
    provider: "provider",
    status: "ok",
    settledAt: Date.UTC(2026, 10, 21),
    currency: "USD" as const,
    customerChargeNanos: 1,
    providerCostNanos: 0,
    providerCostBasis: "provider_reported",
    usage: { inputTokens: 0, outputTokens: 50 },
  },
  calls: [] as { name: string; args: unknown }[],
}));

vi.mock("next/link", () => ({
  default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
}));
vi.mock("./workspace.module.css", () => ({
  default: new Proxy({}, { get: (_, key) => String(key) }),
}));
vi.mock("./gateway-workspace.module.css", () => ({
  default: new Proxy({}, { get: (_, key) => String(key) }),
}));
vi.mock("convex/react", () => ({
  Authenticated: ({ children }: { children: ReactNode }) => children,
  AuthLoading: () => null,
  Unauthenticated: () => null,
  useAction: () => vi.fn(),
  useMutation: () => vi.fn(),
  usePaginatedQuery: (reference: Parameters<typeof getFunctionName>[0], args: unknown) => {
    fixture.calls.push({ name: getFunctionName(reference), args });
    return { results: fixture.projects, status: "Exhausted", loadMore: vi.fn() };
  },
  useQuery: (reference: Parameters<typeof getFunctionName>[0], args: unknown) => {
    const name = getFunctionName(reference);
    if (args === "skip") return undefined;
    fixture.calls.push({ name, args });
    switch (name) {
      case "account:current": return { profile: {} };
      case "workspaces:overview": return { capabilities: fixture.capabilities, workspace: { id: "workspace1", name: "Platform" } };
      case "gatewayCredentials:project": return fixture.linkedProject;
      case "gatewayReceipts:list": return { receipts: [fixture.receipt], truncated: true };
      case "gatewayReceipts:get": return fixture.receipt;
      case "gatewayOperations:workspaceReport": return {
        limit: 2000,
        ...aggregateGateway([{ ...fixture.receipt, status: "ok", providerCostBasis: "provider_reported" }]),
        alerts: { items: [], evaluatedAt: null, truncated: false },
      };
      case "gatewayEvals:list": return fixture.evals;
      case "gatewayCredentials:list": return { credentials: [], truncated: false };
      default: throw new Error(`Unexpected query ${name}`);
    }
  },
}));

beforeEach(() => {
  fixture.capabilities["finance:read"] = true;
  fixture.capabilities["collectors:manage"] = false;
  fixture.linkedProject = null;
  fixture.evals = { runs: [] };
  fixture.calls.length = 0;
});

function render(projectHint = "project1") {
  return renderToStaticMarkup(<GatewayWorkspace projectHint={projectHint} receiptHint="request:123" today="2026-11-21" />);
}

describe("private gateway workspace", () => {
  test("skips project and receipt queries when the workspace role lacks gateway access", () => {
    fixture.capabilities["finance:read"] = false;
    const view = render();
    expect(view).toContain("Gateway access required");
    expect(fixture.calls.map(({ name }) => name)).toEqual(["account:current", "workspaces:overview"]);
  });

  test("resolves a linked request within its project and distinguishes zero from unreported usage", () => {
    const view = render();
    expect(fixture.calls).toContainEqual({
      name: "gatewayReceipts:get",
      args: { projectId: "project1", requestId: "request:123" },
    });
    expect(view).toContain("Showing the latest 50 receipts");
    expect(view).toContain("Apply dates");
    expect(view).toContain("Provider breakdown");
    expect(view).toContain("Model breakdown");
    expect(view).toContain("Operational alerts");
    expect(view).toContain("Set up eval publication");
    expect(view).toContain("<dt>Input</dt><dd>0</dd>");
    expect(view).toContain("<dt>Cache read</dt><dd>Unreported</dd>");
    expect(view).toContain("<dt>Customer charge (USD)</dt><dd>$0.000000001</dd>");
    expect(view).toContain("<dt>Provider cost (USD)</dt><dd>$0.00</dd>");
    expect(view).not.toContain("Create key");
  });

  test("does not look up a receipt in another project when the linked project is unavailable", () => {
    const view = render("project2");
    expect(view).toContain("linked project");
    expect(fixture.calls.some(({ name }) => name.startsWith("gatewayReceipts:"))).toBe(false);
  });

  test("opens an authorized linked project outside the current picker page", () => {
    fixture.linkedProject = { _id: "project2", name: "Historical project" };
    const view = render("project2");
    expect(view).toContain("Historical project");
    expect(fixture.calls).toContainEqual({
      name: "gatewayReceipts:get",
      args: { projectId: "project2", requestId: "request:123" },
    });
  });

  test("shows synthetic run metrics and baseline regressions for the selected project", () => {
    const observation = { caseId: "json-answer", inputTokens: 40, outputTokens: 16, chargedMicrousd: 19, latencyMs: 87 };
    fixture.evals.runs = [{
      runId: "fixture-100-2",
      baselineRunId: "fixture-100-1",
      createdAt: Date.UTC(2026, 10, 21),
      report: {
        mode: "fixture", dataset: "gateway-smoke", datasetVersion: "1", evaluator: "deterministic-v1",
        routes: [
          { id: "near-flash", provider: "near-ai", model: "example", passed: 0, total: 1, results: [{ ...observation, passed: false }] },
          { id: "phala-flash", provider: "phala", model: "example", passed: 1, total: 1, results: [{ ...observation, passed: true }] },
        ],
      },
      gate: { passed: false, regressions: [{ routeId: "near-flash", caseId: "json-answer" }] },
    }];

    const view = render();
    expect(fixture.calls).toContainEqual({ name: "gatewayEvals:list", args: { projectId: "project1" } });
    expect(view).toContain("fixture-100-2 · Fixture · 1/2 cases passed · Quality regression");
    expect(view).toContain("<dt>Input / output tokens</dt><dd>80 / 32</dd>");
    expect(view).toContain("<dt>Simulated charge</dt><dd>$0.000038</dd>");
    expect(view).toContain("<dt>P95 latency</dt><dd>87 ms</dd>");
    expect(view).toContain("<dt>Baseline run</dt><dd>fixture-100-1</dd>");
    expect(view).toContain("near-flash / json-answer");
  });

  test("a key manager without financial access can issue ingest keys only", () => {
    fixture.capabilities["finance:read"] = false;
    fixture.capabilities["collectors:manage"] = true;
    const view = render();
    expect(view).toContain("Create key");
    expect(view).not.toContain('value="report"');
    expect(view).not.toContain("Hosted eval runs");
    expect(fixture.calls.some(({ name }) => name === "gatewayEvals:list")).toBe(false);
    expect(fixture.calls.some(({ name }) => name.startsWith("gatewayReceipts:"))).toBe(false);
  });
});
