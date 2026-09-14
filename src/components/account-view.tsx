"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { AuthLoading, Authenticated, Unauthenticated, useMutation, useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { ArrowUpRight } from "./icons";
import { GitHubIcon } from "./auth-controls";

function friendlyError(error: unknown) {
  const message = String(error);
  if (message.includes("PROFILE_UNAVAILABLE")) return "That handle is already in use.";
  if (message.includes("INVALID_HANDLE")) return "Use 1–39 letters, numbers, or hyphens.";
  return "We could not save that change. Please try again.";
}

function AccountPanel() {
  const account = useQuery(api.account.current, {});
  const ensureProfile = useMutation(api.account.ensureProfile);
  const setVisibility = useMutation(api.account.setProfileVisibility);
  const { signOut } = useAuth();
  const [handle, setHandle] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function createProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      await ensureProfile({ handle });
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setSaving(false);
    }
  }

  async function toggleVisibility() {
    if (!account?.profile) return;
    setError("");
    setSaving(true);
    try {
      await setVisibility({ isPublic: !account.profile.isPublic });
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setSaving(false);
    }
  }

  if (account === undefined) return <div className="account-loading">Loading your workspace…</div>;
  if (!account) return <div className="account-loading">Confirming your secure session…</div>;

  return (
    <div className="account-card">
      <div className="account-card-head">
        <div>
          <span className="section-index">Personal workspace</span>
          <h1>{account.user.name || "Your UsageMax account"}</h1>
          <p>{account.user.email}</p>
        </div>
        <button className="button button-outline" onClick={() => void signOut({ returnTo: "/" })} type="button">Sign out</button>
      </div>

      {account.profile ? (
        <div className="account-profile-row">
          <div>
            <span>Public profile</span>
            <strong>@{account.profile.handle}</strong>
            <small>{account.profile.isPublic ? "Visible on the public network" : "Private to your account"}</small>
          </div>
          <div className="account-profile-actions">
            <button className="button button-outline" disabled={saving} onClick={() => void toggleVisibility()} type="button">
              Make {account.profile.isPublic ? "private" : "public"}
            </button>
            <Link className="button button-dark" href={`/${account.profile.handle}`}>View profile <ArrowUpRight size={15} /></Link>
          </div>
        </div>
      ) : (
        <form className="account-create" onSubmit={createProfile}>
          <div>
            <span className="section-index">Create your profile</span>
            <h2>Choose your public handle.</h2>
            <p>Your profile starts private. You decide when it joins the leaderboard.</p>
          </div>
          <label>
            <span>usagemax.com/</span>
            <input autoComplete="off" maxLength={39} onChange={(event) => setHandle(event.target.value)} pattern="[A-Za-z0-9-]+" placeholder="your-handle" required value={handle} />
          </label>
          <button className="button button-primary" disabled={saving} type="submit">{saving ? "Creating…" : "Create profile"}</button>
        </form>
      )}
      {error ? <p className="account-error" role="alert">{error}</p> : null}
      <div className="account-security-note"><span>Identity</span><p>Secured by WorkOS. UsageMax never receives your GitHub password.</p></div>
    </div>
  );
}

export function AccountView() {
  return (
    <section className="account-page shell">
      <AuthLoading><div className="account-loading">Loading your secure workspace…</div></AuthLoading>
      <Authenticated><AccountPanel /></Authenticated>
      <Unauthenticated>
        <div className="account-signin">
          <span className="section-index">UsageMax account</span>
          <h1>Your usage belongs to you.</h1>
          <p>Sign in with GitHub to create a private workspace, connect collectors, and choose what appears publicly.</p>
          <Link className="button button-dark" href="/sign-in"><GitHubIcon /> Sign in with GitHub</Link>
        </div>
      </Unauthenticated>
    </section>
  );
}
