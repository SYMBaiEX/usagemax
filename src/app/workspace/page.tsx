import type { Metadata } from "next";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import type { AuthSearch } from "@/lib/auth-flow";
import { readWorkspaceTab, signInHref, workspaceHref } from "@/lib/product-navigation";
import { WorkspaceView } from "@/components/workspace-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Workspace",
  robots: { index: false, follow: false },
};
export default async function WorkspacePage({ searchParams }: { searchParams: Promise<AuthSearch> }) {
  const search = await searchParams;
  const tab = readWorkspaceTab(search.tab);
  const { user } = await withAuth();
  if (!user) redirect(signInHref(workspaceHref(tab)));
  return <WorkspaceView tab={tab} billingStatus={typeof search.billing === "string" ? search.billing : undefined} />;
}
