import type { Metadata } from "next";

import { DocsView } from "@/components/content-pages";

export const metadata: Metadata = {
  title: "UsageMax developer documentation",
  description: "Send AI telemetry to UsageMax and read compact public projections in realtime.",
  alternates: { canonical: "https://usagemax.com/docs" },
};

export default function DocsPage() {
  return <DocsView />;
}
