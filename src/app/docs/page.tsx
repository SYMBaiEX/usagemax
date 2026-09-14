import type { Metadata } from "next";

import { DocsView } from "@/components/content-pages";

export const metadata: Metadata = {
  title: "Documentation",
  description: "Send AI telemetry to UsageMax and read compact public projections in realtime.",
};

export default function DocsPage() {
  return <DocsView />;
}
