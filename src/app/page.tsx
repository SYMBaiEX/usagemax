import type { Metadata } from "next";

import { HomeView } from "@/components/usagemax";

export const metadata: Metadata = {
  title: "Your AI work, made visible",
  description: "Track your AI token usage, compare stats, and share the public record of what you build.",
};

export default function Home() {
  return <HomeView />;
}
