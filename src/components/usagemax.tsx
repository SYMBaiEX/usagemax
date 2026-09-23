"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { modelSeries, otherColor, rankingValues, type ModelDay } from "@/lib/chart-data";

const UsageTrend = dynamic(() => import("./usage-charts").then(m => m.UsageTrend));
const HeroSparkline = dynamic(() => import("./usage-charts").then(m => m.HeroSparkline));
const ModelFlow = dynamic(() => import("./usage-charts").then(m => m.ModelFlow));
const ActivityCalendar = dynamic(() => import("./usage-charts").then(m => m.ActivityCalendar));
const RhythmCharts = dynamic(() => import("./usage-charts").then(m => m.RhythmCharts));
import { useEffect, useMemo, useState } from "react";
import { CodeField } from "./code-field";
import { ProfileAvatar } from "./profile-avatar";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { compactNumber, currencyFromMicros, relativeTime, shortDate } from "@/lib/format";
import { ArrowUpRight } from "./icons";

type Period = "7d" | "30d" | "all";
type Metric = "tokens" | "spend";
type CostBasis = "reported" | "estimated" | "api-equivalent" | "mixed" | "unknown";

type LeaderboardRowData = { handle: string; displayName: string; avatarUrl?: string; verification: string; period: Period; metric: Metric; score: number; totalTokens: number; totalCostMicros: number; sessions: number; activeDays: number; lastEventAt: number; updatedAt: number };
type DailyRow = { date: string; totalTokens: number; outputTokens: number; unclassifiedTokens?: number; costMicros: number; costBasis?: CostBasis; sessions: number; requests: number; errors: number };
type DailyModelRow = { date: string; model: string; provider: string; totalTokens: number; costMicros: number; costBasis?: CostBasis };
type ModelRow = { provider: string; model: string; totalTokens: number; inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number; reasoningTokens?: number; unclassifiedTokens?: number; costMicros: number; costBasis?: CostBasis; requests: number; errors: number; lastUsedAt: number };
type ProfileStats = { totalTokens: number; totalCostMicros: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens?: number; reasoningTokens: number; unclassifiedTokens?: number; costBasis?: CostBasis; costSource?: string; sources?: string[]; sessions: number; activeDays: number; currentStreakDays: number; longestStreakDays: number; deviceCount: number; topModel: string; topModelProvider?: string; topModelMetric?: "tokens" | "spend"; sessionCoverage?: "unknown" | "partial" | "complete"; firstDay?: string; lastDay?: string; lastEventAt?: number; leaderboardRank?: number; peakDay?: string; peakDayCostMicros?: number; avgCostPerActiveDayMicros?: number; lastSyncAt?: number; syncStatus?: "healthy" | "degraded" | "stale"; syncErrorCode?: string; pricingVersion?: string; updatedAt: number };
type ProfileData = { profile: { handle: string; displayName: string; bio: string; avatarUrl?: string; isPublic: boolean; isVerified: boolean; verification: string; createdAt: number }; stats: ProfileStats | null; models: ModelRow[] };
type BreakdownRow = { key: string; totalTokens: number; costMicros: number };
type BreakdownData = { sources: BreakdownRow[]; devices: BreakdownRow[] };
type AgentRow = { externalId: string; parentExternalId?: string; name: string; model: string; state: string; task?: string; tokensPerSecond: number; totalTokens: number; toolCalls: number; errorCount: number; sessionStartedAt: number; updatedAt: number; expiresAt: number };
type EventRow = { _id?: string; eventKey: string; agentName?: string; eventType: "model_request" | "tool_call" | "agent_state" | "outcome"; source: string; model: string; totalTokens: number; costMicros: number; latencyMs?: number; status: "ok" | "error" | "cancelled"; task?: string; occurredAt: number };
type LiveData = { agents: AgentRow[]; events: EventRow[] };
type ProfileSnapshotData = ProfileData & { moreModels: boolean; daily: DailyRow[]; dailyModels: DailyModelRow[]; breakdowns: BreakdownData; coverage: Record<"daily" | "dailyModels" | "sources" | "devices", "complete" | "truncated">; live: LiveData };

const convexConfigured = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

function safeNumber(value: number | null | undefined) { return typeof value === "number" && Number.isFinite(value) ? value : 0; }
function costBasisLabel(value: CostBasis | undefined) { return value === "reported" ? "provider reported" : value === "mixed" ? "mixed / partially unpriced" : value === "estimated" ? "source estimate" : value === "unknown" ? "unpriced usage excluded" : "API-equivalent estimate"; }
function formatModel(value: string) { return value.replace(/^claude-/, "Claude ").replace(/^gpt-/, "GPT-").replace(/^gemini-/, "Gemini ").replace(/-/g, " "); }
function sentenceCase(value: string) { return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()); }

function VerifyBadge() { return <span aria-label="Verified profile" className="verify-badge" title="Verified profile">✓</span>; }
function Skeleton({ className = "" }: { className?: string }) { return <span aria-hidden="true" className={`skeleton ${className}`} />; }
function LivePill({ children = "Live" }: { children?: string }) { return <span className="live-pill"><i />{children}</span>; }


function LeaderboardTable({ rows, loading, period, metric, emptyLabel }: { rows?: LeaderboardRowData[]; loading?: boolean; period: Period; metric: Metric; emptyLabel: string }) {
  return <div className="ranking-table-wrap" tabIndex={0} role="region" aria-label="Scrollable public leaderboard"><table className="ranking-table"><thead><tr><th>#</th><th>Builder</th><th aria-sort={metric === "spend" ? "descending" : "none"}>Spend<small>{metric === "spend" && period !== "all" ? period : "All time"}</small></th><th aria-sort={metric === "tokens" ? "descending" : "none"}>Tokens<small>{metric === "tokens" && period !== "all" ? period : "All time"}</small></th><th>Sessions<small>All time</small></th><th>Active days<small>All time</small></th><th>Last active</th><th /></tr></thead><tbody>{loading ? Array.from({ length: 7 }, (_, index) => <tr key={index}><td><Skeleton /></td><td><Skeleton className="skeleton-wide" /></td><td><Skeleton /></td><td><Skeleton /></td><td><Skeleton /></td><td><Skeleton /></td><td><Skeleton /></td><td /></tr>) : rows?.length ? rows.map((row, index) => <tr key={`${row.handle}-${row.period}-${row.metric}`}><td><span className={`table-rank ${index < 3 ? "is-top" : ""}`}>{index + 1}</span></td><td><Link className="table-person" href={`/${row.handle}`}><ProfileAvatar handle={row.handle} /><span><strong>{row.displayName || row.handle}{row.verification === "verified" ? <VerifyBadge /> : null}</strong><small>@{row.handle}</small></span></Link></td><td><strong>{currencyFromMicros(rankingValues(row).costMicros)}</strong></td><td><strong>{compactNumber(rankingValues(row).tokens, 2)}</strong></td><td>{compactNumber(row.sessions)}</td><td>{compactNumber(row.activeDays)}</td><td>{row.lastEventAt ? relativeTime(new Date(row.lastEventAt)) : "—"}</td><td><Link aria-label={`View ${row.handle}`} className="table-open" href={`/${row.handle}`}><ArrowUpRight size={15} /></Link></td></tr>) : <tr><td colSpan={8} className="table-empty" role="status">{emptyLabel}</td></tr>}</tbody></table></div>;
}


function Toggle<T extends string>({ values, value, labels, onChange }: { values: T[]; value: T; labels: Record<T, string>; onChange: (value: T) => void }) {
  return <div aria-label="Leaderboard filter" className="filter-pills" role="group">{values.map((item) => <button aria-pressed={item === value} className={item === value ? "is-active" : ""} key={item} onClick={() => onChange(item)} type="button">{labels[item]}</button>)}</div>;
}

function LeaderboardData() {
  const [period, setPeriod] = useState<Period>("7d");
  const [metric, setMetric] = useState<Metric>("tokens");
  const [query, setQuery] = useState("");
  const rows = useQuery(api.public.leaderboard, { period, metric, limit: 100 }) as LeaderboardRowData[] | undefined;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleRows = rows?.filter((row) => `${row.displayName} ${row.handle}`.toLowerCase().includes(normalizedQuery));
  const emptyLabel = normalizedQuery
    ? `No matches in the top 100 profiles for “${query.trim()}”.`
    : "No public profiles in this window yet.";
  return <div className="page-surface leaderboard-page">
    <section className="leaderboard-hero shell"><div className="page-title-row"><h1>Leaderboard</h1><Link className="text-link" href="/methodology">Methodology <ArrowUpRight size={14} /></Link></div></section>
    <section className="leaderboard-browser shell"><div className="leaderboard-controls"><Toggle labels={{ tokens: "Most tokens", spend: "Most spend" }} onChange={setMetric} value={metric} values={["tokens", "spend"]} /><Toggle labels={{ "7d": "7 days", "30d": "30 days", all: "All time" }} onChange={setPeriod} value={period} values={["7d", "30d", "all"]} /><label className="profile-search"><span className="sr-only">Search profiles</span><input onChange={(event) => setQuery(event.target.value)} placeholder="Search builders" type="search" value={query} /></label></div><div className="ranking-shell leaderboard-ranking"><div className="ranking-shell-top"><LivePill>{rows ? `${visibleRows?.length ?? 0} ${(visibleRows?.length ?? 0) === 1 ? "profile" : "profiles"}` : "Loading profiles"}</LivePill><span>{metric === "tokens" ? "Token volume" : "API-equivalent spend"} / {period === "all" ? "all time" : period}</span></div><LeaderboardTable loading={rows === undefined} rows={visibleRows} period={period} metric={metric} emptyLabel={emptyLabel} /></div></section>
    <p className="leaderboard-disclosure shell">Public profiles only. Costs may include API-equivalent estimates, not subscription bills.</p>
  </div>;
}

export function LeaderboardView() { return convexConfigured ? <LeaderboardData /> : <div className="page-surface empty-page"><h1>Leaderboard</h1><p>Rankings are temporarily unavailable.</p></div>; }

function StatTile({ label, value, note, featured = false }: { label: string; value: string; note: string; featured?: boolean }) {
  return <div className={`stat-tile ${featured ? "is-featured" : ""}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

function ModelTable({ models, totalTokens, dailyModels, moreModels }: { models: ModelRow[]; totalTokens: number; dailyModels: ModelDay[]; moreModels: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const sorted = [...models].sort((a, b) => b.costMicros - a.costMicros);
  const shown = expanded ? sorted : sorted.slice(0, 6);
  const colors = useMemo(() => new Map(modelSeries(dailyModels, 30).models.map(model => [model.id, model.color])), [dailyModels]);
  return <div className="model-panel" id="models"><div className="panel-title"><div><h3>Model totals</h3></div><small>All time · ordered by spend{moreModels ? " · top 100 shown" : ""}</small></div><div className="model-table">{shown.map((model, index) => { const share = totalTokens ? (model.totalTokens / totalTokens) * 100 : 0; return <div key={`${model.provider}-${model.model}`}><span className="model-index">{String(index + 1).padStart(2, "0")}</span><span><strong>{formatModel(model.model)}</strong><small>{model.provider} · {share.toFixed(1)}% of all-time tokens</small></span><i aria-hidden="true"><b style={{ background: colors.get(`${model.provider}\u001f${model.model}`) ?? otherColor, width: `${Math.min(100, share)}%` }} /></i><span className="model-value"><strong>{compactNumber(model.totalTokens, 2)}</strong><small>{currencyFromMicros(model.costMicros)}</small></span></div>; })}</div>{moreModels ? <p className="feed-empty">Showing the top 100 models by spend.</p> : null}{!models.length ? <p className="feed-empty">No model totals reported yet.</p> : null}{models.length > 6 ? <button type="button" className="model-expand" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "Show fewer models ↑" : `Show all ${models.length} listed models ↓`}</button> : null}</div>;
}

function DimensionPanel({ title, rows }: { title: string; rows: BreakdownRow[] }) {
  const total = rows.reduce((sum, row) => sum + row.totalTokens, 0);
  return <div className="dimension-panel"><div className="panel-title"><div><h3>{title}</h3></div><small>Latest 30 reported days</small></div><div className="dimension-list">{rows.length ? rows.slice(0, 8).map((row) => { const share = total ? (row.totalTokens / total) * 100 : 0; return <div key={row.key}><span><strong>{row.key}</strong><small>{currencyFromMicros(row.costMicros)}</small></span><i><b style={{ width: `${share}%` }} /></i><strong>{compactNumber(row.totalTokens, 2)}</strong></div>; }) : <div className="feed-empty">No breakdown reported yet.</div>}</div></div>;
}

function CoverageSummary({ stats }: { stats: ProfileStats | null }) {
  const unclassified = safeNumber(stats?.unclassifiedTokens);
  return <details className="coverage-summary shell"><summary><span><i className={stats?.syncStatus === "degraded" ? "is-partial" : ""} /><strong>Data confidence</strong></span><span>{stats?.lastSyncAt ? `Last upload ${relativeTime(new Date(stats.lastSyncAt))}` : "Waiting for first upload"}</span></summary><div><dl><div><dt>Collection coverage</dt><dd>{stats?.sessionCoverage === "complete" ? "Retained history assessed" : stats?.sessionCoverage === "partial" ? "Partial history assessment" : "Coverage not assessed"}</dd></div><div><dt>Cost basis</dt><dd>{costBasisLabel(stats?.costBasis)}</dd></div><div><dt>Session identity</dt><dd>{stats?.sessionCoverage === "complete" ? "Complete for detected retained sources" : "May be incomplete"}</dd></div><div><dt>Token allocation</dt><dd>{unclassified ? `${compactNumber(unclassified, 2)} tokens await source detail` : "All reported tokens allocated"}</dd></div></dl><p>UsageMax stores aggregate counters and opaque session identities. Prompts, responses, files, project paths, and provider credentials are not collected.</p></div></details>;
}

function LiveActivity({ live, loading, now }: { live: LiveData; loading: boolean; now: number }) {
  const online = live.agents.filter((agent) => agent.expiresAt > now);
  return <section className="live-activity-section" id="activity" aria-busy={loading}><div className="live-activity-head"><div><LivePill>{loading ? "Connecting" : `${online.length} agents online`}</LivePill><h2>Live activity</h2></div></div><div className="live-activity-grid"><div className="agent-feed"><div className="feed-label">Recent agents</div>{loading ? <><span className="sr-only" role="status">Loading recent agents</span><Skeleton className="skeleton-tall" /></> : live.agents.length ? live.agents.slice(0, 8).map((agent) => { const isOnline = agent.expiresAt > now; return <div className="agent-item" key={agent.externalId}><span aria-hidden="true" className={isOnline ? "agent-status is-online" : "agent-status"} /><span><strong>{agent.name}</strong><small>{agent.task || sentenceCase(agent.state)} · {formatModel(agent.model)}</small></span><span><strong>{isOnline ? compactNumber(agent.tokensPerSecond, 1) : "Idle"}</strong><small>{isOnline ? "online · tok/s" : `idle · ${relativeTime(new Date(agent.updatedAt))}`}</small></span></div>; }) : <div className="feed-empty">No agent heartbeat in this window.</div>}</div><div className="event-feed"><div className="feed-label">Recent log</div>{loading ? <><span className="sr-only" role="status">Loading recent public events</span><Skeleton className="skeleton-tall" /></> : live.events.length ? live.events.slice(0, 12).map((event) => <div className="event-item" key={event._id || event.eventKey}><span aria-hidden="true" className={`event-dot is-${event.status}`} /><time>{new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(event.occurredAt))}</time><span><strong>{event.agentName || event.source}</strong><small>{sentenceCase(event.eventType)} · {formatModel(event.model)} · {event.status}</small></span><span>{event.totalTokens ? compactNumber(event.totalTokens, 1) : event.latencyMs ? `${event.latencyMs}ms` : "—"}</span></div>) : <div className="feed-empty">No public events in this window.</div>}</div></div></section>;
}

function PublicLive({ handle, compact = false }: { handle: string; compact?: boolean }) {
  const live = useQuery(api.public.live, { handle, agentLimit: 12, eventLimit: 24 });
  const [now, setNow] = useState(0);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    refresh();
    const timer = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(timer);
  }, []);
  if (compact) return <LivePill>{live === undefined ? "Connecting" : live.agents.some(agent => agent.expiresAt > now) ? "Working now" : "No active heartbeat"}</LivePill>;
  return <LiveActivity live={live ?? { agents: [], events: [] }} loading={live === undefined} now={now} />;
}

function DetailUnavailable({ label }: { label: string }) {
  return <p role="status" className="feed-empty">{label} unavailable for this volume. Complete detail is available through the paginated public API.</p>;
}

function ProfileNotFound({ handle }: { handle: string }) {
  return <div className="page-surface empty-page"><span className="section-index">404 / PUBLIC PROFILE</span><h1>No public stats for <em>@{handle}</em>.</h1><p>This profile is private, disconnected, or has not been claimed yet.</p><Link className="button button-primary" href="/leaderboard">Explore profiles <ArrowUpRight size={16} /></Link></div>;
}

function ProfileDataView({ handle }: { handle: string }) {
  const normalizedHandle = handle.replace(/^@/, "").toLowerCase();
  const snapshot = useQuery(api.public.profileSnapshot, { handle: normalizedHandle, days: 365, includeLive: false }) as ProfileSnapshotData | null | undefined;
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  if (snapshot === undefined) return <div aria-busy="true" className="page-surface profile-loading"><span className="sr-only" role="status">Loading public profile</span><Skeleton className="skeleton-profile" /><Skeleton className="skeleton-profile-body" /></div>;
  if (snapshot === null) return <ProfileNotFound handle={normalizedHandle} />;

  const { profile, stats, models, daily, dailyModels, breakdowns, coverage } = snapshot;
  const rank = stats?.leaderboardRank ? `#${stats.leaderboardRank}` : "—";
  async function share() { try { await navigator.clipboard.writeText(window.location.href); setCopyError(false); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { setCopyError(true); } }

  return <div className="page-surface profile-page">
    <div className="profile-toolbar shell"><Link href="/leaderboard">← Leaderboard</Link><nav aria-label="Profile sections"><a href="#usage">Usage</a><a href="#models">Models</a><a href="#activity">Activity</a></nav></div><section className="profile-cover shell"><div className="profile-chart-hero"><CodeField /><div className="profile-chart-total"><span>All-time tokens</span><strong>{compactNumber(safeNumber(stats?.totalTokens), 2)}</strong><small>{currencyFromMicros(safeNumber(stats?.totalCostMicros))} {costBasisLabel(stats?.costBasis)}</small>{coverage.daily === "complete" ? <HeroSparkline rows={daily} /> : <DetailUnavailable label="Daily history" />}</div><div className="profile-chart-meta"><PublicLive handle={normalizedHandle} compact /><span>Since {stats?.firstDay ? shortDate(stats.firstDay) : "first upload"}</span></div></div><aside className="profile-identity-card"><div className="profile-avatar-row"><ProfileAvatar handle={profile.handle} size="large" /><button onClick={share} type="button">{copied ? "Copied" : "Share"} <ArrowUpRight size={14} /></button></div><div><h1>{profile.displayName || profile.handle}{profile.isVerified ? <VerifyBadge /> : null}</h1><p className="profile-handle">@{profile.handle}</p></div>{profile.bio ? <p className="profile-bio">{profile.bio}</p> : null}{copyError ? <p className="copy-fallback">Copy failed. Select this URL: <span>{typeof window === "undefined" ? `https://usagemax.com/${profile.handle}` : window.location.href}</span></p> : null}<div className="identity-facts"><span><small>Rank</small><strong>{rank}</strong></span><span><small>Top model by {stats?.topModelMetric === "tokens" ? "tokens" : "spend"}</small><strong>{formatModel(stats?.topModel || "—")}</strong></span></div><div className="identity-update"><i /> Last upload {stats?.lastSyncAt ? relativeTime(new Date(stats.lastSyncAt)) : stats?.lastEventAt ? relativeTime(new Date(stats.lastEventAt)) : "not received"}</div></aside></section>
    <CoverageSummary stats={stats} />
    <section className="profile-stats shell"><StatTile label="Total spend" note={costBasisLabel(stats?.costBasis)} value={currencyFromMicros(safeNumber(stats?.totalCostMicros))} /><StatTile label="Sessions" note={`${compactNumber(safeNumber(stats?.deviceCount))} privacy-safe devices`} value={compactNumber(safeNumber(stats?.sessions))} /><StatTile label="Active days" note={stats?.firstDay ? `since ${shortDate(stats.firstDay)}` : "since first upload"} value={compactNumber(safeNumber(stats?.activeDays))} /><StatTile label="Current streak" note={`best ${safeNumber(stats?.longestStreakDays)} days`} value={`${safeNumber(stats?.currentStreakDays)} days`} /></section>
    <section className="profile-data shell" id="usage">{coverage.daily === "complete" ? <UsageTrend rows={daily} /> : <DetailUnavailable label="Daily history" />}{coverage.dailyModels === "complete" ? <ModelFlow rows={dailyModels} /> : <DetailUnavailable label="Model history" />}{coverage.daily === "complete" ? <><ActivityCalendar rows={daily} /><RhythmCharts rows={daily} /></> : null}<ModelTable models={models} totalTokens={safeNumber(stats?.totalTokens)} dailyModels={dailyModels} moreModels={snapshot.moreModels} /><div className="dimension-grid">{coverage.sources === "complete" ? <DimensionPanel rows={breakdowns.sources} title="Sources" /> : <DetailUnavailable label="Sources" />}{coverage.devices === "complete" ? <DimensionPanel rows={breakdowns.devices} title="Devices" /> : <DetailUnavailable label="Devices" />}</div><PublicLive handle={normalizedHandle} /></section>
  </div>;
}

export function ProfileView({ handle }: { handle: string }) { return convexConfigured ? <ProfileDataView handle={handle} /> : <div className="page-surface empty-page"><h1>This profile is waiting for Convex.</h1></div>; }
