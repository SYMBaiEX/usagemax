import type { Metadata } from "next";

import { ProfileView } from "@/components/usagemax";

type ProfilePageProps = {
  params: Promise<{ handle: string }>;
};

export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const { handle } = await params;
  const normalizedHandle = handle.replace(/^@/, "").toLowerCase();
  return {
    title: `@${normalizedHandle} profile`,
    description: `Public AI usage telemetry and live agent signal for @${normalizedHandle}.`,
    openGraph: {
      title: `@${normalizedHandle} · UsageMax`,
      description: `Public AI usage telemetry for @${normalizedHandle}.`,
    },
  };
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { handle } = await params;
  return <ProfileView handle={handle} />;
}
