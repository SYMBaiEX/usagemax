import { v } from "convex/values";

export const memberRole = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("finance"),
  v.literal("manager"),
  v.literal("member"),
  v.literal("auditor"),
  v.literal("viewer"),
);
export type MemberRole = typeof memberRole.type;
export const roles: readonly MemberRole[] = [
  "owner",
  "admin",
  "finance",
  "manager",
  "member",
  "auditor",
  "viewer",
];

// Free workspace bounds protect service capacity. A Stripe-active Team
// subscription is represented by the internal `pro` plan; enterprise remains
// contract-gated rather than self-serve.
export function productPolicy(plan: string) {
  const enterprise = plan === "enterprise";
  const paidTeam = plan === "pro";
  return {
    tier: enterprise ? ("enterprise" as const) : paidTeam ? ("team" as const) : ("free" as const),
    enterprise,
    members: enterprise ? 10_000 : paidTeam ? 100 : 10,
    teams: enterprise ? 500 : paidTeam ? 50 : 5,
    projects: enterprise ? 2_000 : paidTeam ? 200 : 20,
    devices: enterprise ? 5_000 : paidTeam ? 250 : 25,
    budgets: enterprise ? 200 : paidTeam ? 50 : 5,
    savedViews: enterprise ? 200 : paidTeam ? 100 : 30,
    privateProfiles: true,
    history: true,
    exports: true,
  };
}

export function validMoney(value: number, allowNegative = false) {
  return (
    Number.isSafeInteger(value) &&
    (allowNegative || value >= 0) &&
    Math.abs(value) <= 1_000_000_000_000_000
  );
}

export function validCurrency(value: string) {
  return (
    /^[A-Z]{3}$/.test(value) &&
    Intl.supportedValuesOf("currency").includes(value)
  );
}

export function safeCsvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${(/^[=+\-@\t\r]/.test(text) ? "'" : "") + text.replaceAll('"', '""')}"`;
}
