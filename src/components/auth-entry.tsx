import { withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { readAuthContext, type AuthMode, type AuthSearch } from "@/lib/auth-flow";
import { AuthPage } from "./auth-page";

export async function AuthEntry({ mode, searchParams }: { mode: AuthMode; searchParams: Promise<AuthSearch> }) {
  const search = await searchParams;
  const context = readAuthContext(search);
  const { user } = await withAuth();
  // An existing session must not swallow an invitation or organization login.
  if (user && !context.invitationToken && !context.organizationId && !search.error) redirect(context.returnTo);
  return <AuthPage mode={mode} context={context} error={typeof search.error === "string" ? search.error : undefined} />;
}
