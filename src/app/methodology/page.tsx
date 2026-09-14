import type { Metadata } from "next";

import { MethodologyView } from "@/components/content-pages";

export const metadata: Metadata = {
  title: "Methodology",
  description: "How UsageMax counts events, aggregates usage, and keeps public metrics bounded.",
};

export default function MethodologyPage() {
  return <MethodologyView />;
}
