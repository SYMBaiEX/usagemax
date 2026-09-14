"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { compactNumber, currencyFromMicros, relativeTime, shortDate } from "@/lib/format";
import { ArrowRight, ArrowUpRight, CopyIcon } from "./icons";

type Period = "7d" | "30d" | "all";
type Metric = "tokens" | "spend";
type CostBasis = "reported" | "estimated" | "api-equivalent" | "mixed" | "unknown";

type NetworkData = { totalTokens: number; totalCostMicros: number; totalSessions: number; profiles: number; activeAgents: number; eventsToday: number; updatedAt: number };
type LeaderboardRowData = { handle: string; displayName: string; avatarUrl?: string; verification: string; period: Period; metric: Metric; score: number; totalTokens: number; totalCostMicros: number; sessions: number; activeDays: number; lastEventAt: number; updatedAt: number };
type DailyRow = { date: string; totalTokens: number; outputTokens: number; unclassifiedTokens?: number; costMicros: number; costBasis?: CostBasis; sessions: number; requests: number; errors: number };
type DailyModelRow = { date: string; model: string; provider: string; totalTokens: number; costMicros: number; costBasis?: CostBasis };
type ModelRow = { provider: string; model: string; totalTokens: number; inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number; reasoningTokens?: number; unclassifiedTokens?: number; costMicros: number; costBasis?: CostBasis; requests: number; errors: number; lastUsedAt: number };
type ProfileStats = { totalTokens: number; totalCostMicros: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens?: number; reasoningTokens: number; unclassifiedTokens?: number; costBasis?: CostBasis; costSource?: string; sources?: string[]; sessions: number; activeDays: number; currentStreakDays: number; longestStreakDays: number; deviceCount: number; topModel: string; firstDay?: string; lastDay?: string; lastEventAt?: number; updatedAt: number };
type ProfileData = { profile: { handle: string; displayName: string; bio: string; avatarUrl?: string; isPublic: boolean; isVerified: boolean; verification: string; sourceUrl?: string; importedAt?: number; createdAt: number }; stats: ProfileStats | null; models: ModelRow[] };
type AgentRow = { externalId: string; parentExternalId?: string; name: string; model: string; state: string; task?: string; tokensPerSecond: number; totalTokens: number; toolCalls: number; errorCount: number; sessionStartedAt: number; updatedAt: number; expiresAt: number; online: boolean };
type EventRow = { _id: string; eventKey: string; agentName?: string; eventType: "model_request" | "tool_call" | "agent_state" | "outcome"; source: string; model: string; totalTokens: number; costMicros: number; latencyMs?: number; status: "ok" | "error" | "cancelled"; task?: string; occurredAt: number };
type LiveData = { agents: AgentRow[]; events: EventRow[] };

const convexConfigured = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
const installCommand = "bunx usagemax@latest bootstrap";
const modelColors = ["#ff5a1f", "#171412", "#4976f2", "#a9d56e", "#f3b64e", "#b483ff"];

function safeNumber(value: number | null | undefined) { return typeof value === "number" && Number.isFinite(value) ? value : 0; }
function costBasisLabel(value: CostBasis | undefined) { return value === "reported" ? "provider reported" : value === "mixed" ? "mixed / partially unpriced" : value === "estimated" ? "source estimate" : value === "unknown" ? "unpriced usage excluded" : "API-equivalent estimate"; }
function initials(value: string) { const words = value.trim().split(/\s+/).filter(Boolean); return words.length > 1 ? `${words[0][0]}${words.at(-1)?.[0] ?? ""}`.toUpperCase() : value.slice(0, 2).toUpperCase() || "UM"; }
function toneFor(value: string) { return value.split("").reduce((total, character) => total + character.charCodeAt(0), 0) % 360; }
function formatModel(value: string) { return value.replace(/^claude-/, "Claude ").replace(/^gpt-/, "GPT-").replace(/^gemini-/, "Gemini ").replace(/-/g, " "); }
function sentenceCase(value: string) { return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()); }

function Avatar({ name, size = "small" }: { name: string; size?: "small" | "large" }) {
  return <span aria-hidden="true" className={`avatar avatar-${size}`} style={{ "--avatar-hue": toneFor(name) } as CSSProperties}>{initials(name)}</span>;
}
function VerifyBadge() { return <span aria-label="Verified profile" className="verify-badge" title="Verified profile">✓</span>; }
function Skeleton({ className = "" }: { className?: string }) { return <span aria-hidden="true" className={`skeleton ${className}`} />; }
function LivePill({ children = "Live" }: { children?: string }) { return <span className="live-pill"><i />{children}</span>; }

function CopyCommand() {
  const [copied, setCopied] = useState(false);
  async function copy() { await navigator.clipboard.writeText(installCommand); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
  return <div className="install-command"><span className="command-prompt">$</span><code>{installCommand}</code><button aria-label="Copy install command" onClick={copy} type="button"><CopyIcon size={16} /> {copied ? "Copied" : "Copy"}</button></div>;
}

function HeroVisual({ network }: { network: NetworkData | null | undefined }) {
  const bars = [18, 25, 21, 31, 27, 42, 36, 48, 40, 61, 53, 68, 57, 76, 65, 82, 73, 91, 78, 96, 87, 100, 92, 97];
  return <div className="usage-preview" aria-label="Live UsageMax workspace preview">
    <div className="usage-preview-head"><span><i /> Live workspace</span><small>Realtime ledger</small></div>
    <div className="usage-preview-total"><span>Tracked usage</span><strong>{network ? compactNumber(network.totalTokens, 2) : "—"}</strong><small>tokens across every connected runtime</small></div>
    <div className="usage-preview-chart" aria-hidden="true">{bars.map((height, index) => <i key={index} style={{ "--bar-height": `${height}%` } as CSSProperties} />)}</div>
    <div className="usage-preview-metrics"><span><small>Profiles</small><strong>{network ? compactNumber(network.profiles) : "—"}</strong></span><span><small>Sessions</small><strong>{network ? compactNumber(network.totalSessions) : "—"}</strong></span><span><small>Events today</small><strong>{network ? compactNumber(network.eventsToday) : "—"}</strong></span></div>
    <div className="usage-preview-stream"><div><i className="stream-status is-live" /><span><strong>Agent runtime</strong><small>gpt-6-astra · active</small></span><b>+18.4k</b></div><div><i className="stream-status" /><span><strong>Model request</strong><small>claude-sonnet · complete</small></span><b>+7.2k</b></div><div><i className="stream-status" /><span><strong>Tool execution</strong><small>workspace · 420ms</small></span><b>+1.1k</b></div></div>
  </div>;
}

function ProfileCard({ row, rank }: { row: LeaderboardRowData; rank: number }) {
  return <Link className="featured-profile-card" href={`/${row.handle}`}><div className="featured-profile-top"><Avatar name={row.displayName || row.handle} /><span>#{String(rank).padStart(2, "0")}</span></div><div><h3>{row.displayName || row.handle}{row.verification === "verified" ? <VerifyBadge /> : null}</h3><p>@{row.handle}</p></div><div className="featured-profile-stats"><span><small>Tokens</small><strong>{compactNumber(row.totalTokens, 2)}</strong></span><span><small>Spend</small><strong>{currencyFromMicros(row.totalCostMicros)}</strong></span></div><ArrowUpRight size={18} /></Link>;
}

function pathFor(values: number[]) {
  if (values.length < 2) return "M0 220 L800 220";
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const range = Math.max(max - min, 1);
  return values.map((value, index) => {
    const x = (index / (values.length - 1)) * 800;
    const y = 220 - ((value - min) / range) * 190;
    return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
}

function movingAverage(values: number[], windowSize = 5) {
  return values.map((_, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const sample = values.slice(start, index + 1);
    return sample.reduce((sum, value) => sum + value, 0) / sample.length;
  });
}

function ProfileHeroChart({ rows }: { rows: DailyRow[] }) {
  const recent = rows.slice(-90);
  return <div className="profile-chart-line" aria-hidden="true"><svg viewBox="0 0 800 240" preserveAspectRatio="none"><path d={pathFor(movingAverage(recent.map((row) => row.totalTokens)))} /><path className="chart-ghost" d={pathFor(movingAverage(recent.map((row) => row.costMicros)))} /></svg></div>;
}

function LeaderboardTable({ rows, loading }: { rows?: LeaderboardRowData[]; loading?: boolean }) {
  return <div className="ranking-table-wrap"><table className="ranking-table"><thead><tr><th>#</th><th>Builder</th><th>Spend</th><th>Tokens</th><th>Sessions</th><th>Active days</th><th>Last active</th><th /></tr></thead><tbody>{loading ? Array.from({ length: 7 }, (_, index) => <tr key={index}><td><Skeleton /></td><td><Skeleton className="skeleton-wide" /></td><td><Skeleton /></td><td><Skeleton /></td><td><Skeleton /></td><td><Skeleton /></td><td><Skeleton /></td><td /></tr>) : rows?.length ? rows.map((row, index) => <tr key={`${row.handle}-${row.period}-${row.metric}`}><td><span className={`table-rank ${index < 3 ? "is-top" : ""}`}>{index + 1}</span></td><td><Link className="table-person" href={`/${row.handle}`}><Avatar name={row.displayName || row.handle} /><span><strong>{row.displayName || row.handle}{row.verification === "verified" ? <VerifyBadge /> : null}</strong><small>@{row.handle}</small></span></Link></td><td><strong>{currencyFromMicros(row.totalCostMicros)}</strong></td><td><strong>{compactNumber(row.totalTokens, 2)}</strong></td><td>{compactNumber(row.sessions)}</td><td>{compactNumber(row.activeDays)}</td><td>{row.lastEventAt ? relativeTime(new Date(row.lastEventAt)) : "—"}</td><td><Link aria-label={`View ${row.handle}`} className="table-open" href={`/${row.handle}`}><ArrowUpRight size={15} /></Link></td></tr>) : <tr><td colSpan={8} className="table-empty">No public profiles in this window yet.</td></tr>}</tbody></table></div>;
}

function HomeData() {
  const network = useQuery(api.public.network, {}) as NetworkData | null | undefined;
  const rows = useQuery(api.public.leaderboard, { period: "7d", metric: "tokens", limit: 8 }) as LeaderboardRowData[] | undefined;
  return <div className="page-surface home-page">
    <section className="home-hero shell"><div className="home-hero-copy"><span className="hero-kicker">The system of record for AI usage</span><h1>AI usage,<br /><em>accounted for.</em></h1><p>One realtime ledger for tokens, spend, models, agents, and outcomes—across every person and machine.</p><div className="home-hero-actions"><Link className="button button-primary" href="/sign-in">Sign in with GitHub <ArrowUpRight size={16} /></Link><Link className="button button-light" href="/symbaiex">View live profile <ArrowRight size={16} /></Link></div><CopyCommand /><div className="hero-assurance"><span>Private by default</span><span>No prompts collected</span><span>Built on Convex</span></div></div><HeroVisual network={network} /></section>
    <section className="featured-strip shell" aria-label="Featured UsageMax profiles"><div className="featured-strip-label"><span>Active profiles</span><small>Updated in realtime</small></div><div className="featured-profile-grid">{rows === undefined ? Array.from({ length: 3 }, (_, index) => <div className="featured-profile-card is-loading" key={index}><Skeleton className="skeleton-card" /></div>) : rows.slice(0, 3).map((row, index) => <ProfileCard key={row.handle} rank={index + 1} row={row} />)}</div></section>
    <section className="home-proof shell"><div className="proof-heading"><span className="section-index">01 / UNIFIED LEDGER</span><h2>Every model.<br />One account.</h2></div><div className="proof-copy"><p>UsageMax turns fragmented local activity into a private-by-default ledger your team can actually trust.</p><div className="supported-agents" aria-label="Supported AI coding agents"><span>Codex</span><span>Claude</span><span>Gemini</span><span>OpenCode</span><span>Copilot</span><span>Hermes</span><span>Pi</span></div></div></section>
    <section className="home-ranking shell"><div className="ranking-heading"><div><span className="section-index">02 / PUBLIC NETWORK</span><h2>Proof of work for<br />the agent era.</h2></div><div><p>Opt-in profiles turn otherwise invisible AI work into a legible track record.</p><Link className="arrow-link" href="/leaderboard">Explore the network <ArrowUpRight size={15} /></Link></div></div><div className="ranking-shell"><div className="ranking-shell-top"><LivePill>Realtime ranking</LivePill><span>7 day activity</span></div><LeaderboardTable loading={rows === undefined} rows={rows} /></div></section>
    <section className="profile-promise shell"><div className="profile-preview-card"><div className="profile-preview-head"><Avatar name={rows?.[0]?.displayName || "UsageMax"} size="large" /><span><small>Featured builder</small><strong>{rows?.[0]?.displayName || "Your profile"}</strong><em>@{rows?.[0]?.handle || "handle"}</em></span><LivePill>Verified data</LivePill></div><div className="profile-preview-stats"><span><small>Total tokens</small><strong>{rows?.[0] ? compactNumber(rows[0].totalTokens, 2) : "—"}</strong></span><span><small>Sessions</small><strong>{rows?.[0] ? compactNumber(rows[0].sessions) : "—"}</strong></span><span><small>Active days</small><strong>{rows?.[0] ? compactNumber(rows[0].activeDays) : "—"}</strong></span></div><div className="profile-preview-line"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div></div><div className="promise-copy"><span className="section-index">03 / YOUR PROFILE</span><h2>Usage people can understand.</h2><p>Share the signal that matters—volume, spend, model mix, streaks, sessions, and live agent activity—without sharing your work.</p><Link className="button button-light" href="/symbaiex">View a live profile <ArrowUpRight size={16} /></Link></div></section>
    <section className="home-faq shell"><div><span className="section-index">04 / THE DETAILS</span><h2>Questions,<br />answered plainly.</h2></div><div className="faq-list"><details><summary>What is UsageMax?<span>+</span></summary><p>A local-first AI usage tracker and public stats network. It turns aggregate model usage into profiles, rankings, and realtime activity.</p></details><details><summary>What data gets uploaded?<span>+</span></summary><p>Daily aggregate counts such as model, agent, tokens, sessions, timestamps, and estimated provider cost. Prompts, files, responses, and project content stay out.</p></details><details><summary>Which agents are supported?<span>+</span></summary><p>Codex, Claude Code, OpenCode, Gemini CLI, GitHub Copilot CLI, Hermes, and Pi are the initial targets, with a native telemetry endpoint for custom runtimes.</p></details><details><summary>Can I sync multiple machines?<span>+</span></summary><p>Yes. Idempotent daily rollups merge usage from every connected device into one profile.</p></details><details><summary>How are costs calculated?<span>+</span></summary><p>Provider-reported cost is retained when available. Imported coding-agent usage uses ccusage&apos;s API-equivalent estimate; missing prices stay marked unknown instead of being guessed.</p></details><details><summary>Can I keep my profile private?<span>+</span></summary><p>Yes. Public visibility is a deliberate profile setting, never a requirement for collecting your own usage.</p></details></div></section>
  </div>;
}

export function HomeView() { return convexConfigured ? <HomeData /> : <div className="page-surface empty-page"><h1>UsageMax is waiting for Convex.</h1></div>; }

function Toggle<T extends string>({ values, value, labels, onChange }: { values: T[]; value: T; labels: Record<T, string>; onChange: (value: T) => void }) {
  return <div className="filter-pills">{values.map((item) => <button className={item === value ? "is-active" : ""} key={item} onClick={() => onChange(item)} type="button">{labels[item]}</button>)}</div>;
}

function LeaderboardData() {
  const [period, setPeriod] = useState<Period>("7d");
  const [metric, setMetric] = useState<Metric>("tokens");
  const [query, setQuery] = useState("");
  const rows = useQuery(api.public.leaderboard, { period, metric, limit: 100 }) as LeaderboardRowData[] | undefined;
  const visibleRows = rows?.filter((row) => `${row.displayName} ${row.handle}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="page-surface leaderboard-page">
    <section className="leaderboard-hero shell"><span className="section-index">PUBLIC SCOREBOARD / LIVE</span><h1>The people putting<br /><em>AI to work.</em></h1><p>Ranked from real, connected usage. Choose a window, follow a builder, inspect the proof.</p></section>
    <section className="leaderboard-browser shell"><div className="leaderboard-controls"><Toggle labels={{ tokens: "Most tokens", spend: "Most spend" }} onChange={setMetric} value={metric} values={["tokens", "spend"]} /><Toggle labels={{ "7d": "7 days", "30d": "30 days", all: "All time" }} onChange={setPeriod} value={period} values={["7d", "30d", "all"]} /><label className="profile-search"><span className="sr-only">Search profiles</span><input onChange={(event) => setQuery(event.target.value)} placeholder="Search builders" type="search" value={query} /></label></div><div className="ranking-shell leaderboard-ranking"><div className="ranking-shell-top"><LivePill>{rows ? `${visibleRows?.length ?? 0} profiles` : "Loading profiles"}</LivePill><span>{metric === "tokens" ? "Token volume" : "API-equivalent spend"} / {period === "all" ? "all time" : period}</span></div><LeaderboardTable loading={rows === undefined} rows={visibleRows} /></div></section>
    <section className="leaderboard-note shell"><span>Numbers should invite a closer look.</span><p>Ranking is only the door. Every row opens into the builder&apos;s model mix, cadence, streaks, sessions, and live public activity.</p><Link className="arrow-link" href="/methodology">Read the methodology <ArrowUpRight size={15} /></Link></section>
  </div>;
}

export function LeaderboardView() { return convexConfigured ? <LeaderboardData /> : <div className="page-surface empty-page"><h1>The board is waiting for Convex.</h1></div>; }

function StatTile({ label, value, note, featured = false }: { label: string; value: string; note: string; featured?: boolean }) {
  return <div className={`stat-tile ${featured ? "is-featured" : ""}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

function DailyBars({ rows, metric }: { rows: DailyRow[]; metric: "tokens" | "spend" }) {
  const data = rows.slice(-30);
  const values = data.map((row) => metric === "tokens" ? row.totalTokens : row.costMicros);
  const max = Math.max(...values, 1);
  const total = values.reduce((sum, value) => sum + value, 0);
  return <div className={`data-chart chart-${metric}`}><div className="data-chart-head"><div><span>Daily {metric}</span><strong>{metric === "tokens" ? compactNumber(total, 2) : currencyFromMicros(total)}</strong></div><small>Last 30 days</small></div><div className="bar-chart" aria-label={`Daily ${metric} for the last 30 days`}>{data.map((row, index) => <i key={row.date} title={`${shortDate(row.date)} · ${metric === "tokens" ? compactNumber(row.totalTokens, 2) : currencyFromMicros(row.costMicros)}`} style={{ "--height": `${Math.max(2, (values[index] / max) * 100)}%` } as CSSProperties} />)}</div><div className="chart-axis"><span>{data[0]?.date ? shortDate(data[0].date) : "30 days ago"}</span><span>Today</span></div></div>;
}

function ModelDailyChart({ rows, metric }: { rows: DailyModelRow[]; metric: "tokens" | "spend" }) {
  const topModels = useMemo(() => { const totals = new Map<string, number>(); for (const row of rows) totals.set(row.model, (totals.get(row.model) ?? 0) + (metric === "tokens" ? row.totalTokens : row.costMicros)); return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([model]) => model); }, [rows, metric]);
  const days = useMemo(() => { const grouped = new Map<string, Map<string, number>>(); for (const row of rows) { const day = grouped.get(row.date) ?? new Map<string, number>(); day.set(row.model, (day.get(row.model) ?? 0) + (metric === "tokens" ? row.totalTokens : row.costMicros)); grouped.set(row.date, day); } return [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-30); }, [rows, metric]);
  const max = Math.max(...days.map(([, values]) => [...values.values()].reduce((sum, value) => sum + value, 0)), 1);
  return <div className="model-daily-chart"><div className="stacked-bars" aria-label={`Daily ${metric} split by model`}>{days.map(([date, values]) => { const total = [...values.values()].reduce((sum, value) => sum + value, 0); return <div className="stack-column" key={date} title={`${shortDate(date)} · ${metric === "tokens" ? compactNumber(total, 2) : currencyFromMicros(total)}`} style={{ height: `${Math.max(2, (total / max) * 100)}%` }}>{topModels.map((model, index) => { const amount = values.get(model) ?? 0; return amount > 0 ? <i key={model} style={{ background: modelColors[index], height: `${(amount / total) * 100}%` }} /> : null; })}</div>; })}</div><div className="model-legend">{topModels.map((model, index) => <span key={model}><i style={{ background: modelColors[index] }} />{formatModel(model)}</span>)}</div></div>;
}

function ActivityHeatmap({ rows }: { rows: DailyRow[] }) {
  const values = new Map(rows.map((row) => [row.date, row.totalTokens]));
  const max = Math.max(...rows.map((row) => row.totalTokens), 1);
  const endValue = rows.at(-1)?.date ?? new Date().toISOString().slice(0, 10);
  const end = new Date(`${endValue}T00:00:00Z`);
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - 364);
  const cells: Array<{ date?: string; value?: number }> = Array.from({ length: start.getUTCDay() }, () => ({}));
  for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) { const date = cursor.toISOString().slice(0, 10); cells.push({ date, value: values.get(date) ?? 0 }); }
  return <div className="heatmap-panel"><div className="panel-title"><div><span>Activity</span><h3>{rows.filter((row) => row.totalTokens > 0).length} active days</h3></div><small>Last 12 months</small></div><div className="calendar-wrap"><div className="calendar-labels"><span>M</span><span>W</span><span>F</span></div><div className="calendar-grid">{cells.map((cell, index) => { const level = cell.value ? Math.min(4, Math.ceil((cell.value / max) * 4)) : 0; return <i className={cell.date ? `level-${level}` : "is-spacer"} key={cell.date ?? `spacer-${index}`} title={cell.date ? `${cell.date} · ${compactNumber(cell.value ?? 0, 2)} tokens` : undefined} />; })}</div></div><div className="heatmap-key"><span>Less</span><i className="level-0" /><i className="level-1" /><i className="level-2" /><i className="level-3" /><i className="level-4" /><span>More</span></div></div>;
}

function WeekdayActivity({ rows }: { rows: DailyRow[] }) {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const totals = Array(7).fill(0) as number[];
  rows.forEach((row) => { totals[new Date(`${row.date}T00:00:00Z`).getUTCDay()] += row.totalTokens; });
  const max = Math.max(...totals, 1);
  return <div className="weekday-panel"><div className="panel-title"><div><span>Most active time</span><h3>When the work happens</h3></div></div><div className="weekday-bars">{totals.map((total, index) => <div key={labels[index]}><i style={{ height: `${Math.max(3, (total / max) * 100)}%` }} /><span>{labels[index]}</span></div>)}</div></div>;
}

function MonthlySpend({ rows }: { rows: DailyRow[] }) {
  const totals = new Map<string, number>();
  rows.forEach((row) => totals.set(row.date.slice(0, 7), (totals.get(row.date.slice(0, 7)) ?? 0) + row.costMicros));
  const months = [...totals.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
  const max = Math.max(...months.map(([, value]) => value), 1);
  return <div className="monthly-panel"><div className="panel-title"><div><span>Monthly spend</span><h3>Cost over time</h3></div><small>Last 6 months</small></div><div className="monthly-list">{months.map(([month, value]) => <div key={month}><span>{new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`))}</span><i><b style={{ width: `${(value / max) * 100}%` }} /></i><strong>{currencyFromMicros(value)}</strong></div>)}</div></div>;
}

function ModelTable({ models, totalTokens }: { models: ModelRow[]; totalTokens: number }) {
  return <div className="model-panel"><div className="panel-title"><div><span>Model mix</span><h3>Where the tokens went</h3></div><small>{models.length} models</small></div><div className="model-table">{models.slice(0, 10).map((model, index) => { const share = totalTokens ? (model.totalTokens / totalTokens) * 100 : 0; return <div key={`${model.provider}-${model.model}`}><span className="model-index">{String(index + 1).padStart(2, "0")}</span><span><strong>{formatModel(model.model)}</strong><small>{model.provider} · {compactNumber(model.requests)} requests</small></span><i><b style={{ background: modelColors[index % modelColors.length], width: `${Math.max(1, share)}%` }} /></i><span className="model-value"><strong>{compactNumber(model.totalTokens, 2)}</strong><small>{currencyFromMicros(model.costMicros)}</small></span></div>; })}</div></div>;
}

function LiveActivity({ live, loading }: { live: LiveData; loading: boolean }) {
  const online = live.agents.filter((agent) => agent.online);
  return <section className="live-activity-section"><div className="live-activity-head"><div><LivePill>{loading ? "Connecting" : `${online.length} agents online`}</LivePill><h2>What&apos;s happening now.</h2></div><p>A bounded public window into current agent and tool activity. Content and payloads stay private.</p></div><div className="live-activity-grid"><div className="agent-feed"><div className="feed-label">Recent agents</div>{loading ? <Skeleton className="skeleton-tall" /> : live.agents.length ? live.agents.slice(0, 8).map((agent) => <div className="agent-item" key={agent.externalId}><span className={agent.online ? "agent-status is-online" : "agent-status"} /><span><strong>{agent.name}</strong><small>{agent.task || sentenceCase(agent.state)} · {formatModel(agent.model)}</small></span><span><strong>{agent.online ? compactNumber(agent.tokensPerSecond, 1) : "Idle"}</strong><small>{agent.online ? "tok/s" : relativeTime(new Date(agent.updatedAt))}</small></span></div>) : <div className="feed-empty">No agent heartbeat in this window.</div>}</div><div className="event-feed"><div className="feed-label">Recent log</div>{loading ? <Skeleton className="skeleton-tall" /> : live.events.length ? live.events.slice(0, 12).map((event) => <div className="event-item" key={event._id || event.eventKey}><span className={`event-dot is-${event.status}`} /><time>{new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(event.occurredAt))}</time><span><strong>{event.agentName || event.source}</strong><small>{sentenceCase(event.eventType)} · {formatModel(event.model)}</small></span><span>{event.totalTokens ? compactNumber(event.totalTokens, 1) : event.latencyMs ? `${event.latencyMs}ms` : "—"}</span></div>) : <div className="feed-empty">No public events in this window.</div>}</div></div></section>;
}

function ProfileNotFound({ handle }: { handle: string }) {
  return <div className="page-surface empty-page"><span className="section-index">404 / PUBLIC PROFILE</span><h1>No public stats for <em>@{handle}</em>.</h1><p>This profile is private, disconnected, or has not been claimed yet.</p><Link className="button button-primary" href="/leaderboard">Explore profiles <ArrowUpRight size={16} /></Link></div>;
}

function ProfileDataView({ handle }: { handle: string }) {
  const normalizedHandle = handle.replace(/^@/, "").toLowerCase();
  const profileResult = useQuery(api.public.profile, { handle: normalizedHandle }) as ProfileData | null | undefined;
  const dailyResult = useQuery(api.public.daily, { handle: normalizedHandle, days: 365 }) as DailyRow[] | undefined;
  const dailyModels = useQuery(api.public.dailyModels, { handle: normalizedHandle, days: 30 }) as DailyModelRow[] | undefined;
  const allRanks = useQuery(api.public.leaderboard, { period: "all", metric: "tokens", limit: 100 }) as LeaderboardRowData[] | undefined;
  const [now, setNow] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => { const refresh = () => setNow(Date.now()); refresh(); const timer = window.setInterval(refresh, 15_000); return () => window.clearInterval(timer); }, []);
  const liveResult = useQuery(api.public.live, now ? { handle: normalizedHandle, now, agentLimit: 12, eventLimit: 24 } : "skip") as LiveData | undefined;
  if (profileResult === undefined) return <div className="page-surface profile-loading"><Skeleton className="skeleton-profile" /><Skeleton className="skeleton-profile-body" /></div>;
  if (profileResult === null) return <ProfileNotFound handle={normalizedHandle} />;

  const { profile, stats, models } = profileResult;
  const daily = dailyResult ?? [];
  const live = liveResult ?? { agents: [], events: [] };
  const rankIndex = allRanks?.findIndex((row) => row.handle === profile.handle) ?? -1;
  const rank = rankIndex >= 0 ? `#${rankIndex + 1}` : "—";
  async function share() { await navigator.clipboard.writeText(window.location.href); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }

  return <div className="page-surface profile-page">
    <section className="profile-cover shell"><div className="profile-chart-hero"><ProfileHeroChart rows={daily} /><div className="profile-chart-total"><span>All-time tokens</span><strong>{compactNumber(safeNumber(stats?.totalTokens), 2)}</strong><small>{currencyFromMicros(safeNumber(stats?.totalCostMicros))} {costBasisLabel(stats?.costBasis)}</small></div><div className="profile-chart-meta"><LivePill>{live.agents.filter((agent) => agent.online).length ? "Working now" : "Profile live"}</LivePill><span>Since {stats?.firstDay ? shortDate(stats.firstDay) : "first sync"}</span></div></div><aside className="profile-identity-card"><div className="profile-avatar-row"><Avatar name={profile.displayName || profile.handle} size="large" /><button onClick={share} type="button">{copied ? "Copied" : "Share"} <ArrowUpRight size={14} /></button></div><div><h1>{profile.displayName || profile.handle}{profile.isVerified ? <VerifyBadge /> : null}</h1><p className="profile-handle">@{profile.handle}</p></div><p className="profile-bio">{profile.bio || "Building in public, one token at a time."}</p><div className="identity-facts"><span><small>Rank</small><strong>{rank}</strong></span><span><small>Top model</small><strong>{formatModel(stats?.topModel || "—")}</strong></span></div><div className="identity-update"><i /> Updated {stats?.lastEventAt ? relativeTime(new Date(stats.lastEventAt)) : "on sync"}</div></aside></section>
    <section className="profile-stats shell"><StatTile featured label="Total spend" note={costBasisLabel(stats?.costBasis)} value={currencyFromMicros(safeNumber(stats?.totalCostMicros))} /><StatTile label="Total tokens" note={`${compactNumber(safeNumber(stats?.outputTokens), 2)} output`} value={compactNumber(safeNumber(stats?.totalTokens), 2)} /><StatTile label="Sessions" note={`${compactNumber(safeNumber(stats?.deviceCount))} connected devices`} value={compactNumber(safeNumber(stats?.sessions))} /><StatTile label="Top model" note="by API-equivalent spend" value={formatModel(stats?.topModel || "—")} /><StatTile label="Current streak" note={`best ${safeNumber(stats?.longestStreakDays)} days`} value={`${safeNumber(stats?.currentStreakDays)} days`} /><StatTile label="Active days" note={stats?.firstDay ? `since ${shortDate(stats.firstDay)}` : "since first sync"} value={compactNumber(safeNumber(stats?.activeDays))} /><StatTile label="Leaderboard" note="all-time tokens" value={rank} /><StatTile label={safeNumber(stats?.unclassifiedTokens) > 0 ? "Token detail" : "Cache reads"} note={safeNumber(stats?.unclassifiedTokens) > 0 ? `${compactNumber(safeNumber(stats?.unclassifiedTokens), 2)} awaiting source detail` : `${compactNumber(safeNumber(stats?.reasoningTokens), 2)} reasoning`} value={safeNumber(stats?.unclassifiedTokens) > 0 ? "Partial" : compactNumber(safeNumber(stats?.cacheReadTokens), 2)} /></section>
    <section className="profile-data shell"><div className="profile-section-title"><span className="section-index">USAGE / LAST 30 DAYS</span><h2>The shape of the work.</h2></div><div className="daily-chart-grid"><div><DailyBars metric="spend" rows={daily} />{dailyModels?.length ? <ModelDailyChart metric="spend" rows={dailyModels} /> : null}</div><div><DailyBars metric="tokens" rows={daily} />{dailyModels?.length ? <ModelDailyChart metric="tokens" rows={dailyModels} /> : null}</div></div><ActivityHeatmap rows={daily} /><div className="behavior-grid"><WeekdayActivity rows={daily} /><MonthlySpend rows={daily} /></div><ModelTable models={models} totalTokens={safeNumber(stats?.totalTokens)} /><LiveActivity live={live} loading={liveResult === undefined} /></section>
  </div>;
}

export function ProfileView({ handle }: { handle: string }) { return convexConfigured ? <ProfileDataView handle={handle} /> : <div className="page-surface empty-page"><h1>This profile is waiting for Convex.</h1></div>; }
