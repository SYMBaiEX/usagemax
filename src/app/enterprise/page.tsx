import type { Metadata } from "next";

import { EnterpriseView } from "@/components/content-pages";

export const metadata: Metadata = {
  title: "For teams",
  description: "Track AI usage across connected computers with private workspaces, role-based access, and scoped collector keys.",
  alternates: { canonical: "https://usagemax.com/enterprise" },
};

export default function EnterprisePage() {
  return <EnterpriseView />;
}
