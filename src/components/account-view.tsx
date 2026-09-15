"use client";

import Link from "next/link";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { AuthLoading, Authenticated, Unauthenticated, useAction, useMutation, usePaginatedQuery, useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { AuthNavigation } from "./auth-navigation";
import { ArrowUpRight } from "./icons";

function friendlyError(error: unknown) {
  const message = String(error);
  if (message.includes("PROFILE_UNAVAILABLE")) return "That handle is already in use.";
  if (message.includes("INVALID_HANDLE")) return "Use 1–39 letters, numbers, or hyphens, without a leading or trailing hyphen.";
  if (message.includes("DISPLAY_NAME_REQUIRED")) return "Add a display name before saving.";
  if (message.includes("COLLECTOR_NAME_REQUIRED")) return "Add a name for this collector.";
  if (message.includes("COLLECTOR_LIMIT_REACHED")) return "This workspace has reached its active collector limit.";
  if (message.includes("COLLECTOR_NOT_FOUND")) return "That collector is no longer active.";
  if (message.includes("COLLECTOR_REVOKE_LIMIT_EXCEEDED")) return "This workspace exceeds the emergency revocation limit. Contact support.";
  if (message.includes("LINK_CODE_LIMIT_REACHED")) return "Three link codes are already active. Wait ten minutes, then try again.";
  if (message.includes("ORGANIZATION_NOT_PROVISIONED")) return "An organization admin must provision this UsageMax workspace first.";
  if (message.includes("SESSION_REFRESH_REQUIRED")) return "Your organization access changed. Sign out, then sign in again to refresh it.";
  if (message.includes("FORBIDDEN")) return "Your organization role does not permit that action.";
  if (message.includes("PERSONAL_WORKSPACE_ONLY")) return "Organization workspaces use administrator-managed retention and deletion.";
  if (message.includes("CONFIRMATION_REQUIRED")) return "Type “delete my account” exactly to schedule deletion.";
  if (message.includes("PROFILE_REQUIRED")) return "Create your private profile before linking a computer.";
  return "We could not save that change. Please try again.";
}

function relativeTime(value: number) {
  const minutes = Math.max(0, Math.round((Date.now() - value) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function collectorStatus(lastSuccessAt?: number, revokedAt?: number, phase?: string) {
  if (revokedAt) return "Revoked";
  if (phase === "scanning") return "Reading retained usage";
  if (phase === "uploading") return "Uploading reconciliation";
  if (phase === "failed") return "Last sync interrupted";
  if (!lastSuccessAt) return "Waiting for first upload";
  return `Last upload ${relativeTime(lastSuccessAt)}`;
}

function absoluteTime(value?: number) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function suggestHandle(name?: string, email?: string) {
  const seed = name || email?.split("@")[0] || "";
  return seed.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 39);
}

function platformLabel(value?: string) {
  if (value === "darwin") return "macOS computer";
  if (value === "win32") return "Windows computer";
  if (value === "linux") return "Linux / WSL computer";
  return "Custom integration";
}

function AccountPanel() {
  const account = useQuery(api.account.current, {});
  const auditEvents = usePaginatedQuery(
    api.account.auditLog,
    account?.capabilities["audit:read"] === true ? {} : "skip",
    { initialNumItems: 12 },
  );
  const collectorPage = usePaginatedQuery(
    api.account.listCollectors,
    account?.profile ? {} : "skip",
    { initialNumItems: 20 },
  );
  const ensureProfile = useMutation(api.account.ensureProfile);
  const setVisibility = useMutation(api.account.setProfileVisibility);
  const updateProfile = useMutation(api.account.updateProfile);
  const renameCollector = useMutation(api.account.renameCollector);
  const requestDeletion = useMutation(api.account.requestAccountDeletion);
  const cancelDeletion = useMutation(api.account.cancelAccountDeletion);
  const exportAccount = useAction(api.account.exportAccount);
  const createDeviceLink = useAction(api.account.createDeviceLink);
  const createCollector = useAction(api.account.createCollector);
  const rotateCollector = useAction(api.account.rotateCollector);
  const revokeCollector = useMutation(api.account.revokeCollector);
  const revokeAllCollectors = useMutation(api.account.revokeAllCollectors);
  const { signOut } = useAuth();
  const [handle, setHandle] = useState("");
  const [operation, setOperation] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deviceName, setDeviceName] = useState("");
  const [collectorName, setCollectorName] = useState("");
  const [linkCode, setLinkCode] = useState<{ code: string; expiresAt: number; linkId: Id<"deviceLinkCodes"> } | null>(null);
  const linkStatus = useQuery(api.account.deviceLinkStatus, linkCode ? { linkId: linkCode.linkId } : "skip");
  const [issuedToken, setIssuedToken] = useState<{ collectorId?: Id<"collectors">; token: string } | null>(null);
  const [copied, setCopied] = useState("");
  const [copyFallback, setCopyFallback] = useState("");
  const [editingProfile, setEditingProfile] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [renaming, setRenaming] = useState<Id<"collectors"> | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const deviceInput = useRef<HTMLInputElement>(null);
  const [now, setNow] = useState(Date.now());
  const accountProfileHandle = account?.profile?.handle;

  const linkCommand = useMemo(() => linkCode ? `bunx usagemax@latest link ${linkCode.code}` : "", [linkCode]);
  const linkExpired = Boolean(linkCode && now >= linkCode.expiresAt && !linkStatus?.redeemedAt);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (accountProfileHandle) deviceInput.current?.focus();
  }, [accountProfileHandle]);

  async function downloadExport() {
    const exportData = await run("data-export", () => exportAccount({}));
    if (!exportData) return;
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(exportData, null, 2)}\n`], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `usagemax-${exportData.profile.handle}-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function run<T>(key: string, action: () => Promise<T>) {
    setErrors((current) => ({ ...current, [key]: "" }));
    setOperation(key);
    try {
      return await action();
    } catch (error) {
      setErrors((current) => ({ ...current, [key]: friendlyError(error) }));
      return undefined;
    } finally {
      setOperation("");
    }
  }

  async function createProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run("profile-create", () => ensureProfile({ handle }));
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await run("profile-edit", () => updateProfile({ displayName, bio }));
    if (result) setEditingProfile(false);
  }

  async function makeDeviceLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await run("device-link", () => createDeviceLink({ name: deviceName || "My computer" }));
    if (result) setLinkCode(result);
  }

  async function addCollector(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await run("collector-create", () => createCollector({ name: collectorName || "Custom integration" }));
    if (result) {
      setIssuedToken({ token: result.token });
      setCollectorName("");
    }
  }

  async function rotate(id: Id<"collectors">) {
    if (!window.confirm("Rotate this collector key now? The old key will stop working immediately.")) return;
    const result = await run(`rotate-${id}`, () => rotateCollector({ collectorId: id }));
    if (result) setIssuedToken({ collectorId: id, token: result.token });
  }

  async function revoke(id: Id<"collectors">, name: string) {
    if (!window.confirm(`Revoke ${name}? Future uploads will stop, but existing totals remain.`)) return;
    await run(`revoke-${id}`, () => revokeCollector({ collectorId: id }));
  }

  async function revokeAll() {
    if (!window.confirm("Emergency-revoke every active collector in this workspace? All uploads will stop immediately. Existing totals remain.")) return;
    await run("revoke-all", () => revokeAllCollectors({}));
  }

  async function saveCollectorName(id: Id<"collectors">) {
    const result = await run(`rename-${id}`, () => renameCollector({ collectorId: id, name: renameValue }));
    if (result) setRenaming(null);
  }

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyFallback("");
      setCopied(key);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      setCopyFallback(value);
    }
  }

  if (account === undefined) return <div aria-busy="true" className="account-loading" role="status">Loading your workspace…</div>;
  if (!account) return <div aria-busy="true" className="account-loading" role="status">Confirming your secure session…</div>;

  const collectors = collectorPage.status === "LoadingFirstPage" ? account.collectors : collectorPage.results;
  const computers = collectors.filter((collector) => collector.platform && !collector.revokedAt);
  const firstSyncConfirmed = collectors.some((collector) => Boolean(collector.lastSuccessAt));
  const handleSuggestion = suggestHandle(account.user.name, account.user.email) || "your-handle";
  const canManageProfile = account.capabilities["profile:manage"] === true;
  const canManageCollectors = account.capabilities["collectors:manage"] === true;
  const canExport = account.capabilities["data:export"] === true;
  const canDelete = account.capabilities["workspace:delete"] === true && account.workspace?.kind === "personal";

  return <div className="account-card">
    <div className="account-card-head"><div><span className="section-index">{account.workspace?.kind === "organization" ? "Organization workspace" : "Personal workspace"}{account.workspace?.role ? ` · ${account.workspace.role}` : ""}</span><h1>{account.workspace?.name || account.user.name || "Your UsageMax account"}</h1><p>{account.user.email || "Authenticated with WorkOS"}</p></div><button className="button button-outline" onClick={() => void signOut({ returnTo: "/" })} type="button">Sign out</button></div>

    <ol className="onboarding-rail" aria-label="Setup progress"><li className={account.profile ? "is-complete" : "is-current"} aria-current={!account.profile ? "step" : undefined}><b>01</b><span><strong>Profile created</strong><small>{account.profile ? `@${account.profile.handle}` : "Choose a handle"}</small></span></li><li className={computers.length ? "is-complete" : account.profile ? "is-current" : ""} aria-current={account.profile && !computers.length ? "step" : undefined}><b>02</b><span><strong>Computer linked</strong><small>{computers.length ? `${computers.length} connected` : "Run one command"}</small></span></li><li className={firstSyncConfirmed ? "is-complete" : computers.length ? "is-current" : ""} aria-current={computers.length && !firstSyncConfirmed ? "step" : undefined}><b>03</b><span><strong>First sync confirmed</strong><small>{firstSyncConfirmed ? "Usage received" : "Waiting for completion"}</small></span></li></ol>

    {account.profile ? <>
      <section className="account-profile-row">{editingProfile ? <form className="profile-edit-form" onSubmit={saveProfile}><label>Display name<input maxLength={80} onChange={(event) => setDisplayName(event.target.value)} required value={displayName} /></label><label>Bio<textarea maxLength={280} onChange={(event) => setBio(event.target.value)} rows={3} value={bio} /></label><div><button className="button button-dark" disabled={operation === "profile-edit"} type="submit">{operation === "profile-edit" ? "Saving…" : "Save profile"}</button><button className="button button-outline" onClick={() => setEditingProfile(false)} type="button">Cancel</button></div>{errors["profile-edit"] ? <p role="alert">{errors["profile-edit"]}</p> : null}</form> : <div><span>{account.profile.isPublic ? "Public profile" : "Private profile"}</span><strong>{account.profile.displayName} · @{account.profile.handle}</strong><small>{account.profile.bio || "No bio yet"}</small></div>}{!editingProfile && canManageProfile ? <div className="account-profile-actions"><button className="button button-outline" onClick={() => { setDisplayName(account.profile!.displayName); setBio(account.profile!.bio); setEditingProfile(true); }} type="button">Edit profile</button><button className="button button-outline" disabled={operation === "visibility"} onClick={() => void run("visibility", () => setVisibility({ isPublic: !account.profile!.isPublic }))} type="button">Make {account.profile.isPublic ? "private" : "public"}</button>{account.profile.isPublic ? <Link className="button button-dark" href={`/${account.profile.handle}`}>View public profile <ArrowUpRight size={15} /></Link> : null}</div> : null}</section>

      <section className="device-link-section"><div className="device-link-copy"><span className="section-index">Link a computer</span><h2>Bring your local usage into one account.</h2><p>Generate a ten-minute, one-use code. The CLI exchanges it for a stable device identity and performs a bounded one-shot reconciliation.</p><div className="privacy-pills"><span>No prompts</span><span>No source code</span><span>No provider keys</span></div></div>{canManageCollectors ? <form className="device-link-form" onSubmit={makeDeviceLink}><label htmlFor="device-name">Computer name</label><input id="device-name" maxLength={80} onChange={(event) => setDeviceName(event.target.value)} placeholder="Studio PC, MacBook, CI…" ref={deviceInput} value={deviceName} /><button className="button button-primary" disabled={operation === "device-link"} type="submit">{operation === "device-link" ? "Generating…" : linkExpired ? "Generate new command" : "Generate link command"}</button><small>Works on macOS, Windows, Linux, and WSL.</small>{errors["device-link"] ? <p role="alert">{errors["device-link"]}</p> : null}</form> : <div className="device-link-form"><strong>Read-only access</strong><small>An organization admin can link and manage computers.</small></div>}</section>

      {canManageCollectors && linkCode ? <div className={`link-command ${linkExpired ? "is-expired" : ""}`} role="status"><div><span>{linkStatus?.firstUploadAt ? "First sync confirmed" : linkStatus?.redeemedAt ? "Computer linked · waiting for first completed sync" : linkExpired ? "This command expired" : "Run this on the computer you want to link"}</span><code>{linkCommand}</code></div><button className="button button-dark" disabled={linkExpired || Boolean(linkStatus?.redeemedAt)} onClick={() => void copy(linkCommand, "link")} type="button">{copied === "link" ? "Copied" : "Copy command"}</button><small>Expires {absoluteTime(linkCode.expiresAt)} · {linkStatus?.syncPhase || "one use only"} · requires Bun or Node.js 20+</small></div> : null}
      {copyFallback ? <p className="copy-fallback" role="alert">Clipboard access failed. Select and copy: <span>{copyFallback}</span></p> : null}

      <details className="coverage-summary account-coverage" open={account.coverage?.phase === "failed"}><summary><span><i className={account.coverage?.status === "partial" ? "is-partial" : ""} /><strong>Coverage and reconciliation</strong></span><span>{account.coverage?.completedAt ? `Completed ${relativeTime(account.coverage.completedAt)}` : "Coverage not assessed"}</span></summary><div>{account.coverage ? <dl><div><dt>Status</dt><dd>{account.coverage.status === "complete" ? "Detected retained sources checked" : "Partial assessment"}</dd></div><div><dt>Range</dt><dd>{account.coverage.from || "unknown"} → {account.coverage.to || "unknown"}</dd></div><div><dt>Sources</dt><dd>{account.coverage.sourceCount}</dd></div><div><dt>Partitions</dt><dd>{account.coverage.acceptedPartitions} / {account.coverage.partitionCount}</dd></div><div><dt>Corrections</dt><dd>{account.coverage.correctionRows} authoritative revision{account.coverage.correctionRows === 1 ? "" : "s"}</dd></div></dl> : <p>Run a full reconciliation before treating source count as complete coverage.</p>}<p>Check retained history: <code>bunx usagemax@latest doctor --deep</code><br />Reconcile it: <code>bunx usagemax@latest sync --full --explain</code></p></div></details>

      <section className="account-connections"><div className="account-connections-head"><div><span className="section-index">Connected activity</span><h2>Computers and integrations.</h2></div><small>Sources appear after the first completed sync</small></div><div className="source-strip">{account.connectedSources.length ? account.connectedSources.map((source) => <span key={source}><i />{source}</span>) : <p>No local coding-agent sources reported yet.</p>}</div><div className="collector-list">{collectors.length ? collectors.map((collector) => <div className={collector.revokedAt ? "collector-row is-revoked" : "collector-row"} key={collector.id}><span className="collector-state"><i /><span>{renaming === collector.id ? <span className="collector-rename"><label className="sr-only" htmlFor={`rename-${collector.id}`}>Rename {collector.name}</label><input id={`rename-${collector.id}`} maxLength={80} onChange={(event) => setRenameValue(event.target.value)} value={renameValue} /><button onClick={() => void saveCollectorName(collector.id)} type="button">Save</button><button onClick={() => setRenaming(null)} type="button">Cancel</button></span> : <><strong>{collector.name}</strong><small>{collectorStatus(collector.lastSuccessAt, collector.revokedAt, collector.lastSyncPhase)} · {collector.keyPrefix}…</small></>}</span></span><span><small>{platformLabel(collector.platform)}{collector.cliVersion ? ` · CLI ${collector.cliVersion}` : ""}</small><strong>{absoluteTime(collector.lastSuccessAt)}</strong></span><span className="collector-actions">{collector.revokedAt ? <strong>Revoked</strong> : canManageCollectors ? <><button aria-label={`Rename ${collector.name}`} disabled={Boolean(operation)} onClick={() => { setRenaming(collector.id); setRenameValue(collector.name); }} type="button">Rename</button>{collector.platform ? null : <button aria-label={`Rotate ${collector.name}`} disabled={Boolean(operation)} onClick={() => void rotate(collector.id)} type="button">Rotate</button>}<button aria-label={`Revoke ${collector.name}`} disabled={Boolean(operation)} onClick={() => void revoke(collector.id, collector.name)} type="button">Revoke</button></> : <strong>Read only</strong>}</span>{canManageCollectors && (errors[`rename-${collector.id}`] || errors[`rotate-${collector.id}`] || errors[`revoke-${collector.id}`]) ? <p className="collector-error" role="alert">{errors[`rename-${collector.id}`] || errors[`rotate-${collector.id}`] || errors[`revoke-${collector.id}`]}</p> : null}{canManageCollectors && issuedToken?.collectorId === collector.id ? <div className="collector-token" role="status"><span>New key ready to copy. It is shown once.</span><code>{issuedToken.token}</code><button className="button button-dark" onClick={() => void copy(issuedToken.token, `token-${collector.id}`)} type="button">{copied === `token-${collector.id}` ? "Copied" : "Copy key"}</button></div> : null}</div>) : <div className="collector-empty">No collectors yet. Generate a link command above.</div>}{collectorPage.status === "CanLoadMore" ? <button className="button button-outline collector-load-more" onClick={() => collectorPage.loadMore(25)} type="button">Load more collectors</button> : null}{collectorPage.status === "LoadingMore" ? <p className="collector-empty">Loading more collectors…</p> : null}</div></section>

      {canManageCollectors ? <details className="advanced-collector"><summary>Advanced · custom telemetry collector</summary><div><p>Create a raw collector key for an SDK, CI job, or OpenTelemetry pipeline. The secret is shown once.</p><form onSubmit={addCollector}><label htmlFor="integration-name">Integration name</label><input id="integration-name" maxLength={80} onChange={(event) => setCollectorName(event.target.value)} placeholder="Production OTEL, CI, custom agent…" value={collectorName} /><button className="button button-outline" disabled={operation === "collector-create"} type="submit">{operation === "collector-create" ? "Creating…" : "Create API key"}</button></form></div>{issuedToken && !issuedToken.collectorId ? <div className="collector-token" role="status"><span>Key ready to copy. UsageMax stores only its SHA-256 hash.</span><code>{issuedToken.token}</code><button className="button button-dark" onClick={() => void copy(issuedToken.token, "token-new")} type="button">{copied === "token-new" ? "Copied" : "Copy key"}</button></div> : null}</details> : null}

      {account.capabilities["audit:read"] === true ? <details className="account-audit"><summary><span>Workspace audit trail</span><small>{auditEvents.results.length ? `${auditEvents.results.length} recent events` : "No events yet"}</small></summary><div className="audit-event-list">{auditEvents.results.map((event) => <div className="audit-event-row" key={event.id}><span><strong>{event.summary}</strong><small>{event.action} · {event.targetType}</small></span><time dateTime={new Date(event.createdAt).toISOString()}>{absoluteTime(event.createdAt)}</time></div>)}{auditEvents.status === "LoadingFirstPage" ? <p>Loading audit events…</p> : null}{auditEvents.status === "CanLoadMore" ? <button className="button button-outline" onClick={() => auditEvents.loadMore(25)} type="button">Load older events</button> : null}{auditEvents.status === "LoadingMore" ? <p>Loading older events…</p> : null}</div></details> : null}

      {canManageCollectors || canExport || canDelete ? <details className="account-data-controls"><summary>Data controls</summary><div>{canExport ? <button className="button button-outline" disabled={operation === "data-export"} onClick={() => void downloadExport()} type="button">{operation === "data-export" ? "Preparing export…" : "Download workspace data"}</button> : null}{canManageCollectors ? <div><p>Emergency access control: immediately stop every active computer, CI job, and integration from uploading to this workspace.</p><button className="button button-danger" disabled={Boolean(operation)} onClick={() => void revokeAll()} type="button">{operation === "revoke-all" ? "Revoking all collectors…" : "Revoke all collector access"}</button></div> : null}{canDelete ? account.deletionRequest ? <div><p>Hard deletion is scheduled for {absoluteTime(account.deletionRequest.scheduledFor)}. Collector uploads are disabled during the seven-day recovery window.</p><button className="button button-outline" onClick={() => void run("delete-cancel", () => cancelDeletion({}))} type="button">Cancel deletion and restore collectors</button></div> : <form onSubmit={(event) => { event.preventDefault(); void run("delete-request", () => requestDeletion({ confirmation: deleteConfirmation })); }}><label>Schedule account deletion in seven days<input onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder="delete my account" value={deleteConfirmation} /></label><button className="button button-danger" disabled={operation === "delete-request"} type="submit">Schedule deletion</button></form> : null}{errors["data-export"] ? <p role="alert">{errors["data-export"]}</p> : null}{errors["revoke-all"] ? <p role="alert">{errors["revoke-all"]}</p> : null}{errors["delete-request"] ? <p role="alert">{errors["delete-request"]}</p> : null}</div></details> : null}
    </> : <form className="account-create" onSubmit={createProfile}><div><span className="section-index">Private by default</span><h2>Choose your UsageMax handle.</h2><p>This creates the workspace your computers link to. Nothing appears on the leaderboard until you make the profile public.</p></div><label htmlFor="profile-handle"><span>usagemax.com/</span><input aria-describedby="handle-help" autoComplete="off" id="profile-handle" maxLength={39} onChange={(event) => setHandle(event.target.value)} pattern="[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?" placeholder={handleSuggestion} required value={handle} /></label><small id="handle-help">Letters, numbers and interior hyphens. Your public URL stays stable.</small><button className="button button-primary" disabled={operation === "profile-create"} type="submit">{operation === "profile-create" ? "Creating…" : "Create private workspace"}</button>{errors["profile-create"] ? <p role="alert">{errors["profile-create"]}</p> : null}</form>}
    <div className="account-security-note"><span>Identity and data boundary</span><p>WorkOS secures GitHub and Google sign-in. UsageMax receives aggregate usage metadata and opaque session identities, never your social password or model-provider credentials.</p></div>
  </div>;
}

export function AccountView() {
  return <section className="account-page shell"><AuthLoading><div className="account-loading" role="status">Loading your secure workspace…</div></AuthLoading><Authenticated><AccountPanel /></Authenticated><Unauthenticated><div className="account-signin"><span className="section-index">UsageMax account</span><h1>Your usage belongs to you.</h1><p>Continue with GitHub or Google to create a private workspace, link computers, and choose what appears publicly.</p><AuthNavigation className="button button-dark" href="/sign-in">Continue to secure sign in <ArrowUpRight size={15} /></AuthNavigation></div></Unauthenticated></section>;
}
