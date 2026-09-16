import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchQuery } from "convex/nextjs";

import { ProfileView } from "@/components/usagemax";
import { api } from "../../../convex/_generated/api";

export const dynamic = "force-dynamic";

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
  const normalizedHandle = handle.replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_-]{1,80}$/.test(normalizedHandle)) notFound();
  if (process.env.NEXT_PUBLIC_CONVEX_URL) {
    try {
      const profile = await fetchQuery(api.public.profile, { handle: normalizedHandle });
      if (!profile) notFound();
    } catch {
      // Keep the rendered fallback available during a Convex outage. The
      // profile component will surface its normal loading/unavailable state.
    }
  }
  return <ProfileView handle={handle} />;
}
