import type { Metadata } from "next";

import { LandingPage } from "@/components/landing-page";

export const metadata: Metadata = {
  title: "Your AI work. On the record.",
  description: "Bring your AI tokens, models, and costs into one clear view. Connect your machines, understand your usage, and share only what you choose.",
};

export default function Home() {
  return <LandingPage />;
}
