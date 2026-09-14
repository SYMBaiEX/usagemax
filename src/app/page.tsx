import type { Metadata } from "next";

import { HomeView } from "@/components/usagemax";

export const metadata: Metadata = {
  title: "Public AI telemetry for the visible frontier",
  description: "Follow AI usage, agent activity, and model signal in public.",
};

export default function Home() {
  return <HomeView />;
}
