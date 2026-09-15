import type { Metadata } from "next";
import { AuthEntry } from "@/components/auth-entry";
import type { AuthSearch } from "@/lib/auth-flow";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Create your account", robots: { index: false, follow: false }, alternates: { canonical: "/sign-up" } };

export default function SignUpPage({ searchParams }: { searchParams: Promise<AuthSearch> }) {
  return <AuthEntry mode="sign-up" searchParams={searchParams} />;
}
