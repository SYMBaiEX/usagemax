import type { Metadata } from "next";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";

import { gatewayHref, signInHref } from "@/lib/product-navigation";
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
  const { projectId, requestId } = await searchParams;
  const projectHint = typeof projectId === "string" && /^[a-z0-9]{1,80}$/.test(projectId) ? projectId : null;
  const receiptHint = typeof requestId === "string" && /^[A-Za-z0-9_-][A-Za-z0-9_.:-]{0,119}$/.test(requestId) ? requestId : null;
  const { user } = await withAuth();
  if (!user) redirect(signInHref(gatewayHref(projectHint, receiptHint)));

  const today = new Date().toISOString().slice(0, 10);
  return <GatewayWorkspace projectHint={projectHint} receiptHint={receiptHint} today={today} />;
}
