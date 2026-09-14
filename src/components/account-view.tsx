"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { AuthLoading, Authenticated, Unauthenticated, useAction, useMutation, useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ArrowUpRight } from "./icons";
import { GitHubIcon } from "./auth-controls";

function friendlyError(error: unknown) {
  const message = String(error);
  if (message.includes("PROFILE_UNAVAILABLE")) return "That handle is already in use.";
  if (message.includes("INVALID_HANDLE")) return "Use 1–39 letters, numbers, or hyphens.";
  if (message.includes("COLLECTOR_LIMIT_REACHED")) return "This workspace already has eight active collectors.";
  if (message.includes("COLLECTOR_NOT_FOUND")) return "That collector is no longer active.";
  return "We could not save that change. Please try again.";
}

function collectorStatus(lastSeenAt?: number, revokedAt?: number) {
  if (revokedAt) return "Revoked";
  if (!lastSeenAt) return "Waiting for first sync";
  const age = Date.now() - lastSeenAt;
  if (age < 5 * 60_000) return "Live";
  if (age < 24 * 60 * 60_000) return "Recently synced";
  return "Stale";
}

function collectorTime(value?: number) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function AccountPanel() {
  const account = useQuery(api.account.current, {});
  const ensureProfile = useMutation(api.account.ensureProfile);
  const setVisibility = useMutation(api.account.setProfileVisibility);
  const createCollector = useAction(api.account.createCollector);
  const rotateCollector = useAction(api.account.rotateCollector);
  const revokeCollector = useMutation(api.account.revokeCollector);
  const { signOut } = useAuth();
  const [handle, setHandle] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [collectorName, setCollectorName] = useState("");
  const [issuedToken, setIssuedToken] = useState("");
  const [copied, setCopied] = useState(false);

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

  async function addCollector(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const result = await createCollector({ name: collectorName || "My computer" });
      setIssuedToken(result.token);
      setCollectorName("");
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setSaving(false);
    }
  }

  async function rotate(collectorId: Id<"collectors">) {
    if (!window.confirm("Rotate this collector key now? The old key will stop working immediately.")) return;
    setError("");
    setSaving(true);
    try {
      const result = await rotateCollector({ collectorId });
      setIssuedToken(result.token);
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setSaving(false);
    }
  }

  async function revoke(collectorId: Id<"collectors">) {
    if (!window.confirm("Revoke this collector? It will no longer be able to upload usage.")) return;
    setError("");
    setSaving(true);
    try {
      await revokeCollector({ collectorId });
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setSaving(false);
    }
  }

  async function copyToken() {
    await navigator.clipboard.writeText(issuedToken);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
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
        <><div className="account-profile-row">
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
        <section className="collector-section">
          <div className="collector-head"><div><span className="section-index">Collectors</span><h2>Connect your machines.</h2><p>Keys are scoped to ingestion and shown only once. Collectors send aggregate counters—not prompts, code, files, or responses.</p></div><form onSubmit={addCollector}><input maxLength={80} onChange={(event) => setCollectorName(event.target.value)} placeholder="Laptop, workstation, CI…" value={collectorName} /><button className="button button-primary" disabled={saving} type="submit">Create key</button></form></div>
          {issuedToken ? <div className="collector-token" role="status"><span>Copy this key now. UsageMax stores only its SHA-256 hash.</span><code>{issuedToken}</code><button className="button button-dark" onClick={() => void copyToken()} type="button">{copied ? "Copied" : "Copy key"}</button></div> : null}
          <div className="collector-list">{account.collectors.length ? account.collectors.map((collector) => <div className={collector.revokedAt ? "collector-row is-revoked" : "collector-row"} key={collector.id}><span className="collector-state"><i /><span><strong>{collector.name}</strong><small>{collectorStatus(collector.lastSeenAt, collector.revokedAt)} · {collector.keyPrefix}…</small></span></span><span><small>Last sync</small><strong>{collectorTime(collector.lastSeenAt)}</strong></span><span className="collector-actions">{collector.revokedAt ? null : <><button disabled={saving} onClick={() => void rotate(collector.id)} type="button">Rotate</button><button disabled={saving} onClick={() => void revoke(collector.id)} type="button">Revoke</button></>}</span></div>) : <div className="collector-empty">No collectors yet. Create a key when you are ready to connect a machine.</div>}</div>
          <div className="collector-runtime-note"><span>Low-impact by design</span><p>Run a bounded one-shot sync on a schedule. Do not keep a high-frequency filesystem scanner resident when no usage changed.</p></div>
        </section></>
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
