import type { Metadata } from "next";

import { SecurityView } from "@/components/content-pages";

export const metadata: Metadata = {
  title: "Security and data boundaries",
  description: "UsageMax keeps public AI telemetry aggregated, bounded, and separate from prompt content.",
};

export default function SecurityPage() {
  return <SecurityView />;
}
