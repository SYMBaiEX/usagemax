import type { Metadata } from "next";
import { AuthEntry } from "@/components/auth-entry";
import type { AuthSearch } from "@/lib/auth-flow";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false }, alternates: { canonical: "/sign-in" } };

export default function SignInPage({ searchParams }: { searchParams: Promise<AuthSearch> }) {
  return <AuthEntry mode="sign-in" searchParams={searchParams} />;
}
