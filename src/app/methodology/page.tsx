import type { Metadata } from "next";

import { MethodologyView } from "@/components/content-pages";

export const metadata: Metadata = {
  title: "How we count",
  description: "How UsageMax counts events, aggregates usage, and keeps public metrics bounded.",
  alternates: { canonical: "https://usagemax.com/methodology" },
};

export default function MethodologyPage() {
  return <MethodologyView />;
}
