"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { AuthLoading, Authenticated, Unauthenticated, useAction, useMutation, useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { AuthNavigation } from "./auth-navigation";
import { ArrowUpRight } from "./icons";

function friendlyError(error: unknown) {
  const message = String(error);
  if (message.includes("PROFILE_UNAVAILABLE")) return "That handle is already in use.";
  if (message.includes("INVALID_HANDLE")) return "Use 1–39 letters, numbers, or hyphens.";
  if (message.includes("COLLECTOR_LIMIT_REACHED")) return "This workspace already has eight active collectors.";
  if (message.includes("COLLECTOR_NOT_FOUND")) return "That collector is no longer active.";
  if (message.includes("LINK_CODE_LIMIT_REACHED")) return "Three link codes are already active. Wait ten minutes, then try again.";
  if (message.includes("PROFILE_REQUIRED")) return "Create your private profile before linking a computer.";
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

function suggestHandle(name?: string, email?: string) {
  const seed = name || email?.split("@")[0] || "";
  return seed
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 39);
}

function platformLabel(value?: string) {
  if (value === "darwin") return "macOS";
  if (value === "win32") return "Windows";
  if (value === "linux") return "Linux / WSL";
  return value || "Custom";
}

function AccountPanel() {
  const account = useQuery(api.account.current, {});
  const ensureProfile = useMutation(api.account.ensureProfile);
  const setVisibility = useMutation(api.account.setProfileVisibility);
  const createDeviceLink = useAction(api.account.createDeviceLink);
  const createCollector = useAction(api.account.createCollector);
  const rotateCollector = useAction(api.account.rotateCollector);
  const revokeCollector = useMutation(api.account.revokeCollector);
  const { signOut } = useAuth();
  const [handle, setHandle] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [collectorName, setCollectorName] = useState("");
  const [linkCode, setLinkCode] = useState<{ code: string; expiresAt: number } | null>(null);
  const [issuedToken, setIssuedToken] = useState("");
  const [copied, setCopied] = useState<"link" | "token" | "">("");

  const linkCommand = useMemo(() => linkCode ? `bunx usagemax link ${linkCode.code}` : "", [linkCode]);

  async function run<T>(operation: () => Promise<T>) {
    setError("");
    setSaving(true);
    try {
      return await operation();
    } catch (caught) {
      setError(friendlyError(caught));
      return undefined;
    } finally {
      setSaving(false);
    }
  }

  async function createProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(() => ensureProfile({ handle }));
  }

  async function toggleVisibility() {
    if (account?.profile) await run(() => setVisibility({ isPublic: !account.profile!.isPublic }));
  }

  async function makeDeviceLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await run(() => createDeviceLink({ name: deviceName || "My computer" }));
    if (result) setLinkCode(result);
  }

  async function addCollector(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await run(() => createCollector({ name: collectorName || "Custom integration" }));
    if (result) {
      setIssuedToken(result.token);
      setCollectorName("");
    }
  }

  async function rotate(collectorId: Id<"collectors">) {
    if (!window.confirm("Rotate this collector key now? The old key will stop working immediately.")) return;
    const result = await run(() => rotateCollector({ collectorId }));
    if (result) setIssuedToken(result.token);
  }

  async function revoke(collectorId: Id<"collectors">) {
    if (!window.confirm("Revoke this collector? It will no longer be able to upload usage.")) return;
    await run(() => revokeCollector({ collectorId }));
  }

  async function copy(value: string, kind: "link" | "token") {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(""), 1800);
  }

  if (account === undefined) return <div className="account-loading">Loading your workspace…</div>;
  if (!account) return <div className="account-loading">Confirming your secure session…</div>;

  const activeCollectors = account.collectors.filter((collector) => !collector.revokedAt).length;
  const sources = account.connectedSources;
  const handleSuggestion = suggestHandle(account.user.name, account.user.email) || "your-handle";

  return (
    <div className="account-card">
      <div className="account-card-head">
        <div><span className="section-index">Personal workspace</span><h1>{account.user.name || "Your UsageMax account"}</h1><p>{account.user.email || "Authenticated with WorkOS"}</p></div>
        <button className="button button-outline" onClick={() => void signOut({ returnTo: "/" })} type="button">Sign out</button>
      </div>

      <div className="onboarding-rail" aria-label="Setup progress">
        <div className="is-complete"><b>01</b><span><strong>Signed in</strong><small>GitHub or Google</small></span></div>
        <div className={account.profile ? "is-complete" : "is-current"}><b>02</b><span><strong>Private profile</strong><small>{account.profile ? `@${account.profile.handle}` : "Choose a handle"}</small></span></div>
        <div className={activeCollectors ? "is-complete" : account.profile ? "is-current" : ""}><b>03</b><span><strong>Computer linked</strong><small>{activeCollectors ? `${activeCollectors} active` : "One command"}</small></span></div>
      </div>

      {account.profile ? (
        <>
          <section className="device-link-section">
            <div className="device-link-copy"><span className="section-index">Link a computer</span><h2>Bring your local usage into one account.</h2><p>Generate a ten-minute, one-use code. The CLI exchanges it for a device-scoped collector and performs a bounded one-shot sync.</p><div className="privacy-pills"><span>No prompts</span><span>No source code</span><span>No provider keys</span></div></div>
            <form className="device-link-form" onSubmit={makeDeviceLink}><label htmlFor="device-name">Computer name</label><input id="device-name" maxLength={80} onChange={(event) => setDeviceName(event.target.value)} placeholder="Studio PC, MacBook, CI…" value={deviceName} /><button className="button button-primary" disabled={saving} type="submit">{saving ? "Generating…" : "Generate link command"}</button><small>Works on macOS, Windows, Linux, and WSL.</small></form>
          </section>

          {linkCode ? <div className="link-command" role="status"><div><span>Run this on the computer you want to link</span><code>{linkCommand}</code></div><button className="button button-dark" onClick={() => void copy(linkCommand, "link")} type="button">{copied === "link" ? "Copied" : "Copy command"}</button><small>Expires {collectorTime(linkCode.expiresAt)} · one use only · requires Bun or Node.js 20+</small></div> : null}

          <section className="account-connections">
            <div className="account-connections-head"><div><span className="section-index">Connected activity</span><h2>Computers and coding agents.</h2></div><small>Sources appear after the first sync</small></div>
            <div className="source-strip">{sources.length ? sources.map((source) => <span key={source}><i />{source}</span>) : <p>No local agent accounts detected yet. Link a computer and UsageMax will discover supported sources automatically.</p>}</div>
            <div className="collector-list">{account.collectors.length ? account.collectors.map((collector) => <div className={collector.revokedAt ? "collector-row is-revoked" : "collector-row"} key={collector.id}><span className="collector-state"><i /><span><strong>{collector.name}</strong><small>{collectorStatus(collector.lastSeenAt, collector.revokedAt)} · {collector.keyPrefix}…</small></span></span><span><small>{platformLabel(collector.platform)}{collector.cliVersion ? ` · CLI ${collector.cliVersion}` : ""}</small><strong>{collectorTime(collector.lastSeenAt)}</strong></span><span className="collector-actions">{collector.revokedAt ? null : <><button disabled={saving} onClick={() => void rotate(collector.id)} type="button">Rotate</button><button disabled={saving} onClick={() => void revoke(collector.id)} type="button">Revoke</button></>}</span></div>) : <div className="collector-empty">No collectors yet. Generate a link command above.</div>}</div>
          </section>

          <details className="advanced-collector"><summary>Advanced · custom telemetry collector</summary><div><p>Create a raw collector key for an SDK, CI job, or OpenTelemetry pipeline. The secret is shown once.</p><form onSubmit={addCollector}><input maxLength={80} onChange={(event) => setCollectorName(event.target.value)} placeholder="Production OTEL, CI, custom agent…" value={collectorName} /><button className="button button-outline" disabled={saving} type="submit">Create API key</button></form></div>{issuedToken ? <div className="collector-token" role="status"><span>Copy this key now. UsageMax stores only its SHA-256 hash.</span><code>{issuedToken}</code><button className="button button-dark" onClick={() => void copy(issuedToken, "token")} type="button">{copied === "token" ? "Copied" : "Copy key"}</button></div> : null}</details>

          <div className="account-profile-row"><div><span>Public profile</span><strong>@{account.profile.handle}</strong><small>{account.profile.isPublic ? "Visible on the public network" : "Private to your account"}</small></div><div className="account-profile-actions"><button className="button button-outline" disabled={saving} onClick={() => void toggleVisibility()} type="button">Make {account.profile.isPublic ? "private" : "public"}</button><Link className="button button-dark" href={`/${account.profile.handle}`}>View profile <ArrowUpRight size={15} /></Link></div></div>
        </>
      ) : (
        <form className="account-create" onSubmit={createProfile}><div><span className="section-index">Private by default</span><h2>Choose your UsageMax handle.</h2><p>This creates the workspace your computers link to. Nothing appears on the leaderboard until you make the profile public.</p></div><label><span>usagemax.com/</span><input autoComplete="off" maxLength={39} onChange={(event) => setHandle(event.target.value)} pattern="[A-Za-z0-9-]+" placeholder={handleSuggestion} required value={handle} /></label><button className="button button-primary" disabled={saving} type="submit">{saving ? "Creating…" : "Create private workspace"}</button></form>
      )}
      {error ? <p className="account-error" role="alert">{error}</p> : null}
      <div className="account-security-note"><span>Identity and data boundary</span><p>WorkOS secures GitHub and Google sign-in. UsageMax receives aggregate usage metadata, never your social password or model-provider credentials.</p></div>
    </div>
  );
}

export function AccountView() {
  return <section className="account-page shell"><AuthLoading><div className="account-loading">Loading your secure workspace…</div></AuthLoading><Authenticated><AccountPanel /></Authenticated><Unauthenticated><div className="account-signin"><span className="section-index">UsageMax account</span><h1>Your usage belongs to you.</h1><p>Continue with GitHub or Google to create a private workspace, link computers, and choose what appears publicly.</p><AuthNavigation className="button button-dark" href="/sign-in">Continue to secure sign in <ArrowUpRight size={15} /></AuthNavigation></div></Unauthenticated></section>;
}
