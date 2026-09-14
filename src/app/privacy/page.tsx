import type { Metadata } from "next";

import { PrivacyView } from "@/components/content-pages";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How UsageMax treats telemetry, profile data, and the public surface.",
};

export default function PrivacyPage() {
  return <PrivacyView />;
}
