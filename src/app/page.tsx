import type { Metadata } from "next";

import { LandingPage } from "@/components/landing-page";

export const metadata: Metadata = {
  title: "UsageMax — AI usage observability for builders",
  description: "Privacy-first observability for AI models, agents, and tools across connected computers. Free for individuals and small teams; public sharing is optional.",
  alternates: { canonical: "https://usagemax.com/" },
};

export default function Home() {
  return <LandingPage />;
}
