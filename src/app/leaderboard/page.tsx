import type { Metadata } from "next";

import { LeaderboardView } from "@/components/usagemax";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "A public ranking of sustained AI usage and agent work.",
  alternates: { canonical: "https://usagemax.com/leaderboard" },
};

export default function LeaderboardPage() {
  return <LeaderboardView />;
}
