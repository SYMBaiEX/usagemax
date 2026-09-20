"use client";

import Link from "next/link";
import { useAuth } from "@workos-inc/authkit-nextjs/components";

import { ArrowUpRight } from "./icons";
import { AuthNavigation } from "./auth-navigation";

function GitHubMark({ size = 15 }: { size?: number }) {
  return (
    <svg aria-hidden="true" fill="currentColor" height={size} viewBox="0 0 24 24" width={size}>
      <path d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.16.08 1.78 1.2 1.78 1.2 1.04 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.74-1.55-2.57-.29-5.27-1.28-5.27-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.16 1.18a10.99 10.99 0 0 1 5.76 0c2.2-1.49 3.16-1.18 3.16-1.18.63 1.59.23 2.77.11 3.06.74.81 1.19 1.84 1.19 3.1 0 4.42-2.71 5.4-5.29 5.68.42.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z" />
    </svg>
  );
}

export function HeaderAuthControls() {
  const { user, loading } = useAuth();
  if (loading) return <span aria-hidden="true" className="header-auth-loading" />;
  if (user) {
    const label = user.firstName || user.email || "Account";
    const initials = `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase() || label[0]?.toUpperCase() || "U";
    return (
      <Link className="header-login" href="/workspace">
        <span className="header-account-avatar" aria-hidden="true">{initials}</span>
        <span className="header-login-copy">
          <small>Workspace</small>
          <strong>{label}</strong>
        </span>
      </Link>
    );
  }
  return (
    <AuthNavigation className="header-login header-github" href="/sign-in">
      <GitHubMark /> Sign in
    </AuthNavigation>
  );
}

export function MobileAuthLink() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? (
    <Link href="/workspace">Workspace <ArrowUpRight size={14} /></Link>
  ) : (
    <AuthNavigation href="/sign-in">Sign in <GitHubMark size={14} /></AuthNavigation>
  );
}

export function GitHubIcon({ size = 16 }: { size?: number }) {
  return <GitHubMark size={size} />;
}
