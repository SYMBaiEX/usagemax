import type { Metadata } from "next";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";

import type { AuthSearch } from "@/lib/auth-flow";
import { accountRoute, signInHref } from "@/lib/product-navigation";
import { AccountView } from "@/components/account-view";

export const metadata: Metadata = {
  title: "Account",
  description: "Manage your UsageMax profile and workspace.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: { searchParams: Promise<AuthSearch> }) {
  const route = accountRoute(await searchParams);
  const { user } = await withAuth();
  if (!user) redirect(signInHref(route.href));
  return <AccountView {...route} />;
}
