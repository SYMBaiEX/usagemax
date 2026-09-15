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

// Personal features are not subscriptions. These bounds protect service capacity.
export function productPolicy(plan: string) {
  const enterprise = plan === "enterprise";
  return {
    tier: enterprise ? ("enterprise" as const) : ("free" as const),
    enterprise,
    members: enterprise ? 10_000 : 10,
    teams: enterprise ? 500 : 5,
    projects: enterprise ? 2_000 : 20,
    devices: enterprise ? 5_000 : 25,
    budgets: enterprise ? 200 : 5,
    savedViews: 30,
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
