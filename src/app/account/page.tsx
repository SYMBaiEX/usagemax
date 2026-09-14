import type { Metadata } from "next";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";

import { AccountView } from "@/components/account-view";

export const metadata: Metadata = {
  title: "Account",
  description: "Manage your UsageMax profile and workspace.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const { user } = await withAuth();
  if (!user) redirect("/sign-in");
  return <AccountView />;
}
