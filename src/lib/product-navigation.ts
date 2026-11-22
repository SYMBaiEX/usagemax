import { safeReturnTo, type AuthSearch } from "./auth-flow";

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

export const billingAccountHref = "/account?billing=manage#account-billing";

export function accountRoute(search: AuthSearch) {
  const { setup, next, billing } = search;
  const destination = readWorkspaceReturn(next);
  let href = "/account";
  if (destination) href = accountOnboardingHref(destination);
  else if (billing === "manage") href = billingAccountHref;
  else if (setup === "computer") href = connectComputerHref;
  else if (setup === "telemetry") href = connectTelemetryHref;
  return {
    href,
    destination,
    billing: typeof billing === "string" ? billing : undefined,
    setup: setup === "computer" || setup === "telemetry" ? setup : undefined,
  } as const;
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

export function gatewayRoute(search: AuthSearch) {
  const { projectId, requestId } = search;
  const projectHint = typeof projectId === "string" && /^[a-z0-9]{1,80}$/.test(projectId) ? projectId : null;
  const receiptHint = typeof requestId === "string" && /^[A-Za-z0-9_-][A-Za-z0-9_.:-]{0,119}$/.test(requestId) ? requestId : null;
  return { projectHint, receiptHint, href: gatewayHref(projectHint, receiptHint) };
}
