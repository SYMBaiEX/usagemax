import type { Metadata } from "next";

import { TermsView } from "@/components/content-pages";

export const metadata: Metadata = {
  title: "Terms",
  alternates: { canonical: "https://usagemax.com/terms" },
  description: "The operating terms for using UsageMax public pages and sending telemetry.",
};

export default function TermsPage() {
  return <TermsView />;
}
