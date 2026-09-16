import type { Metadata } from "next";

import { LandingPage } from "@/components/landing-page";

export const metadata: Metadata = {
  title: "UsageMax — Your AI work. On the record.",
  description: "Track AI model, agent, and tool usage across connected computers. Free for individuals and small teams; public sharing is optional.",
  alternates: { canonical: "https://usagemax.com/" },
};

export default function Home() {
  return <LandingPage />;
}
