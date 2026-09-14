import type { Metadata } from "next";

import { AccountView } from "@/components/account-view";

export const metadata: Metadata = {
  title: "Account",
  description: "Manage your UsageMax profile and workspace.",
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return <AccountView />;
}
