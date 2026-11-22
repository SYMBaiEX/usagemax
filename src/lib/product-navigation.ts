import { safeReturnTo } from "./auth-flow";

export const workspaceTabs = [
  "Overview", "Usage", "Activity", "Teams", "Ledger", "Budgets",
  "Savings", "Connections", "Billing", "Settings",
] as const;

export type WorkspaceTab = (typeof workspaceTabs)[number];

export function readWorkspaceTab(value: unknown): WorkspaceTab {
  return workspaceTabs.find((tab) => tab.toLowerCase() === value) ?? "Overview";
}

export function workspaceHref(tab: WorkspaceTab = "Overview", section?: "projects"): string {
  return `/workspace${tab === "Overview" ? "" : `?tab=${tab.toLowerCase()}`}${section ? `#${section}` : ""}`;
}

export const connectComputerHref = "/account?setup=computer#link-computer";
export const connectTelemetryHref = "/account?setup=telemetry#custom-telemetry";

export function accountSetupHref(setup: unknown): string {
  if (setup === "computer") return connectComputerHref;
  if (setup === "telemetry") return connectTelemetryHref;
  return "/account";
}

export function readWorkspaceReturn(value: unknown): string | undefined {
  const path = safeReturnTo(value);
  return /^\/workspace(?:\/gateway)?(?:[?#]|$)/.test(path) ? path : undefined;
}

export function accountOnboardingHref(destination: string): string {
  return `/account?${new URLSearchParams({ next: destination })}`;
}

export function signInHref(destination: string): `/sign-in?${string}` {
  return `/sign-in?${new URLSearchParams({ returnTo: safeReturnTo(destination) })}`;
}

export function gatewayHref(project: string | null, receipt: string | null): string {
  const query = new URLSearchParams();
  if (project) query.set("projectId", project);
  if (receipt) query.set("requestId", receipt);
  return `/workspace/gateway${query.size ? `?${query}` : ""}`;
}
