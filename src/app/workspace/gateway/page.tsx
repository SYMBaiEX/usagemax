import type { Metadata } from "next";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";

import { gatewayRoute, signInHref } from "@/lib/product-navigation";
import { GatewayWorkspace } from "@/components/gateway-workspace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Inference gateway",
  robots: { index: false, follow: false },
};

type GatewaySearch = Promise<{
  projectId?: string | string[];
  requestId?: string | string[];
}>;

export default async function GatewayPage({ searchParams }: { searchParams: GatewaySearch }) {
  const { projectHint, receiptHint, href } = gatewayRoute(await searchParams);
  const { user } = await withAuth();
  if (!user) redirect(signInHref(href));

  const today = new Date().toISOString().slice(0, 10);
  return <GatewayWorkspace projectHint={projectHint} receiptHint={receiptHint} today={today} />;
}
