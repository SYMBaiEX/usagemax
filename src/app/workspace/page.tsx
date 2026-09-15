import type { Metadata } from "next";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { WorkspaceView } from "@/components/workspace-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Workspace",
  robots: { index: false, follow: false },
};
export default async function WorkspacePage() {
  const { user } = await withAuth();
  if (!user) redirect("/sign-in");
  return <WorkspaceView />;
}
