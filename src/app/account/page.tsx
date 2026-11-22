import type { Metadata } from "next";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";

import { billingAccountHref } from "@/lib/billing-navigation";
import type { AuthSearch } from "@/lib/auth-flow";
import { accountOnboardingHref, accountSetupHref, readWorkspaceReturn, signInHref } from "@/lib/product-navigation";
import { AccountView } from "@/components/account-view";

export const metadata: Metadata = {
  title: "Account",
  description: "Manage your UsageMax profile and workspace.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: { searchParams: Promise<AuthSearch> }) {
  const { setup, next, billing } = await searchParams;
  const destination = readWorkspaceReturn(next);
  const billingRecovery = billing === "manage";
  const href = destination ? accountOnboardingHref(destination) : billingRecovery ? billingAccountHref : accountSetupHref(setup);
  const { user } = await withAuth();
  if (!user) redirect(signInHref(href));
  return <AccountView billing={typeof billing === "string" ? billing : undefined} href={href} destination={destination} setup={setup === "computer" || setup === "telemetry" ? setup : undefined} />;
}
