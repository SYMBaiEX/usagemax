"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import { compactNumber, currencyFromMicros, relativeTime, shortDate } from "@/lib/format";
import {
  ActivityIcon,
  ArrowRight,
  ArrowUpRight,
  ChartLine,
  DatabaseIcon,
  LayersIcon,
  LockClosed,
  PulseIcon,
  ShieldCheck,
} from "./icons";

type Period = "7d" | "30d" | "all";
type Metric = "tokens" | "spend";

type NetworkData = {
  totalTokens: number;
  totalCostMicros: number;
  totalSessions: number;
  profiles: number;
  activeAgents: number;
  eventsToday: number;
  updatedAt: number;
};

type LeaderboardRowData = {
  handle: string;
  displayName: string;
  avatarUrl?: string;
  verification: string;
  period: Period;
  metric: Metric;
  score: number;
  totalTokens: number;
  totalCostMicros: number;
  updatedAt: number;
};

type DailyRow = {
  date: string;
  totalTokens: number;
  outputTokens: number;
  costMicros: number;
  sessions: number;
  requests: number;
  errors: number;
};

type ModelRow = {
  provider: string;
  model: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
  requests: number;
  errors: number;
  lastUsedAt: number;
};

type ProfileStats = {
  totalTokens: number;
  totalCostMicros: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  reasoningTokens: number;
  sessions: number;
  activeDays: number;
  currentStreakDays: number;
  longestStreakDays: number;
  deviceCount: number;
  topModel: string;
  firstDay?: string;
  lastDay?: string;
  lastEventAt?: number;
  updatedAt: number;
};

type ProfileData = {
  profile: {
    handle: string;
    displayName: string;
    bio: string;
    avatarUrl?: string;
    isPublic: boolean;
    isVerified: boolean;
    verification: string;
    sourceUrl?: string;
    importedAt?: number;
    createdAt: number;
  };
  stats: ProfileStats | null;
  models: ModelRow[];
};

type AgentRow = {
  externalId: string;
  parentExternalId?: string;
  name: string;
  model: string;
  state: string;
  task?: string;
  tokensPerSecond: number;
  totalTokens: number;
  toolCalls: number;
  errorCount: number;
  sessionStartedAt: number;
  updatedAt: number;
  expiresAt: number;
  online: boolean;
  traceId?: string;
};

type EventRow = {
  _id: string;
  eventKey: string;
  sessionId?: string;
  agentExternalId?: string;
  agentName?: string;
  eventType: "model_request" | "tool_call" | "agent_state" | "outcome";
  source: string;
  provider: string;
  requestedModel?: string;
  model: string;
  totalTokens: number;
  costMicros: number;
  latencyMs?: number;
  status: "ok" | "error" | "cancelled";
  state?: string;
  task?: string;
  traceId?: string;
  occurredAt: number;
  completeness: "reported" | "estimated" | "unknown";
};

type LiveData = {
  agents: AgentRow[];
  events: EventRow[];
};

const convexConfigured = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

function valueOrZero(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function initials(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
  return value.slice(0, 2).toUpperCase() || "UM";
}

function toneFor(value: string) {
  return value.split("").reduce((total, character) => total + character.charCodeAt(0), 0) % 360;
}

function sentenceCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatModel(value: string) {
  return value.replace(/^claude-/, "Claude ").replace(/^gpt-/, "GPT-").replace(/^gemini-/, "Gemini ");
}

function Avatar({ name, size = "small" }: { name: string; size?: "small" | "medium" | "large" }) {
  const tone = toneFor(name);
  return (
    <span
      aria-hidden="true"
      className={`avatar avatar-${size}`}
      style={{ "--avatar-hue": tone } as CSSProperties}
    >
      {initials(name)}
    </span>
  );
}

function VerifyBadge() {
  return (
    <span aria-label="Verified profile" className="verify-badge" title="Verified profile">
      ✓
    </span>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`skeleton ${className}`} />;
}

function DataUnavailable({ label = "Live telemetry is not connected in this preview." }: { label?: string }) {
  return (
    <div className="data-unavailable">
      <span className="data-unavailable-mark">
        <PulseIcon size={19} />
      </span>
      <div>
        <strong>Signal pending</strong>
        <p>{label}</p>
      </div>
    </div>
  );
}

function NetworkWave() {
  return (
    <svg
      aria-label="Recent network activity waveform"
      className="network-wave"
      role="img"
      viewBox="0 0 600 128"
    >
      <defs>
        <linearGradient id="network-wave-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#caff39" stopOpacity="0.28" />
          <stop offset="1" stopColor="#caff39" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="wave-grid" d="M0 32H600M0 64H600M0 96H600" />
      <path
        className="wave-area"
        d="M0 93L24 90L48 95L72 71L96 82L120 60L144 71L168 38L192 58L216 52L240 78L264 64L288 70L312 36L336 46L360 29L384 57L408 51L432 70L456 44L480 51L504 25L528 48L552 37L576 45L600 21V128H0Z"
        fill="url(#network-wave-fill)"
      />
      <path
        className="wave-line"
        d="M0 93L24 90L48 95L72 71L96 82L120 60L144 71L168 38L192 58L216 52L240 78L264 64L288 70L312 36L336 46L360 29L384 57L408 51L432 70L456 44L480 51L504 25L528 48L552 37L576 45L600 21"
      />
      <circle className="wave-ping" cx="504" cy="25" r="4" />
    </svg>
  );
}

function NetworkBoard({ network }: { network: NetworkData | null | undefined }) {
  const loading = network === undefined;
  const live = Boolean(network);
  return (
    <div className="signal-board panel panel-glow">
      <div className="board-header">
        <div className="board-label">
          <span className="icon-chip icon-chip-acid">
            <PulseIcon size={17} />
          </span>
          <span>
            <strong>Network pulse</strong>
            <small>all public signals</small>
          </span>
        </div>
        <span className={`signal-state ${live ? "signal-state-live" : ""}`}>
          <span className="live-dot" />
          {loading ? "Syncing" : live ? "Live" : "Awaiting"}
        </span>
      </div>

      <div className="board-primary">
        <span className="metric-label">Tokens indexed</span>
        <strong className="board-number">
          {loading ? <Skeleton className="skeleton-number" /> : network ? compactNumber(network.totalTokens, 2) : "—"}
        </strong>
        <span className="board-caption">across every connected workspace</span>
      </div>

      <NetworkWave />

      <div className="board-stats">
        <div>
          <span className="metric-label">Active agents</span>
          <strong>{loading ? <Skeleton /> : network ? compactNumber(network.activeAgents) : "—"}</strong>
        </div>
        <div>
          <span className="metric-label">Profiles tracked</span>
          <strong>{loading ? <Skeleton /> : network ? compactNumber(network.profiles) : "—"}</strong>
        </div>
        <div>
          <span className="metric-label">Sessions logged</span>
          <strong>{loading ? <Skeleton /> : network ? compactNumber(network.totalSessions) : "—"}</strong>
        </div>
        <div>
          <span className="metric-label">Events today</span>
          <strong>{loading ? <Skeleton /> : network ? compactNumber(network.eventsToday) : "—"}</strong>
        </div>
      </div>

      <div className="board-footer">
        <span>Spend indexed {network ? currencyFromMicros(network.totalCostMicros) : "—"}</span>
        <span>{network?.updatedAt ? `Updated ${relativeTime(new Date(network.updatedAt))}` : "Awaiting first snapshot"}</span>
      </div>
    </div>
  );
}

function CapabilityCard({
  number,
  icon,
  title,
  description,
  accent,
}: {
  number: string;
  icon: ReactNode;
  title: string;
  description: string;
  accent: "acid" | "cyan" | "orange";
}) {
  return (
    <article className={`capability-card capability-${accent}`}>
      <div className="capability-topline">
        <span className="capability-number">{number}</span>
        <span className="capability-icon">{icon}</span>
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      <span aria-hidden="true" className="card-arrow">
        <ArrowUpRight size={16} />
      </span>
    </article>
  );
}

function LeaderboardRow({ row, rank }: { row: LeaderboardRowData; rank: number }) {
  return (
    <tr>
      <td className="rank-cell" data-label="Rank">
        <span className={`rank-number ${rank < 4 ? "rank-highlight" : ""}`}>{String(rank).padStart(2, "0")}</span>
      </td>
      <td data-label="Builder">
        <Link className="builder-cell" href={`/${row.handle}`}>
          <Avatar name={row.displayName || row.handle} />
          <span>
            <strong>{row.displayName || row.handle}</strong>
            <small>
              @{row.handle} {row.verification === "verified" ? <VerifyBadge /> : null}
            </small>
          </span>
        </Link>
      </td>
      <td className="right-cell" data-label="Signal">
        <strong>{compactNumber(valueOrZero(row.score), 2)}</strong>
        <small>{row.metric === "spend" ? "indexed spend" : "tokens"}</small>
      </td>
      <td className="right-cell secondary-cell" data-label="Sessions">
        <strong>{compactNumber(valueOrZero(row.totalTokens), 2)}</strong>
        <small>total tokens</small>
      </td>
      <td className="row-action-cell">
        <Link aria-label={`Open ${row.handle} profile`} className="row-action" href={`/${row.handle}`}>
          <ArrowUpRight size={15} />
        </Link>
      </td>
    </tr>
  );
}

function LeaderboardTable({ rows, loading }: { rows?: LeaderboardRowData[]; loading?: boolean }) {
  return (
    <div className="leaderboard-table-wrap">
      <table className="leaderboard-table">
        <thead>
          <tr>
            <th scope="col">Rank</th>
            <th scope="col">Builder</th>
            <th className="right-cell" scope="col">Signal</th>
            <th className="right-cell" scope="col">Total</th>
            <th aria-label="Open profile" scope="col" />
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 5 }, (_, index) => (
                <tr key={`loading-${index}`}>
                  <td><Skeleton className="skeleton-short" /></td>
                  <td><span className="builder-cell"><Skeleton className="skeleton-avatar" /><span><Skeleton className="skeleton-line" /><Skeleton className="skeleton-line skeleton-line-small" /></span></span></td>
                  <td><Skeleton className="skeleton-short" /></td>
                  <td><Skeleton className="skeleton-short" /></td>
                  <td />
                </tr>
              ))
            : rows?.length
              ? rows.map((row, index) => <LeaderboardRow key={`${row.handle}-${row.period}-${row.metric}`} rank={index + 1} row={row} />)
              : (
                <tr>
                  <td colSpan={5}><DataUnavailable label="The public board will fill as builders connect a collector." /></td>
                </tr>
              )}
        </tbody>
      </table>
    </div>
  );
}

function LeaderboardPreview({ rows }: { rows?: LeaderboardRowData[] }) {
  return (
    <section className="section shell leaderboard-preview" id="leaderboard-preview">
      <div className="section-heading section-heading-row">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" />Public signal board</div>
          <h2>Who is putting in the reps?</h2>
        </div>
        <Link className="text-link" href="/leaderboard">View full board <ArrowUpRight size={15} /></Link>
      </div>
      <div className="preview-frame panel">
        <div className="preview-frame-topline">
          <span><span className="live-dot" /> 7 day token signal</span>
          <span className="mono-muted">RANK / 050</span>
        </div>
        <LeaderboardTable loading={rows === undefined} rows={rows} />
      </div>
    </section>
  );
}

function HomeUnavailable() {
  return (
    <div className="home-page page-surface">
      <section className="hero shell">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" />Public AI telemetry</div>
          <h1>Make your <span className="hero-accent">agent signal</span> legible.</h1>
          <p className="hero-description">UsageMax is the public observability layer for builders running serious AI systems.</p>
          <DataUnavailable />
        </div>
      </section>
    </div>
  );
}

function HomeData() {
  const network = useQuery(api.public.network, {}) as NetworkData | null | undefined;
  const rows = useQuery(api.public.leaderboard, { period: "7d", metric: "tokens", limit: 5 }) as LeaderboardRowData[] | undefined;

  return (
    <div className="home-page page-surface">
      <section className="hero shell">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" />Public AI telemetry / 2026</div>
          <h1>Make your <span className="hero-accent">agent signal</span> legible.</h1>
          <p className="hero-description">UsageMax is the public observability layer for builders running serious AI systems. Follow the work, understand the cost, and see the signal in motion.</p>
          <div className="hero-actions">
            <Link className="button button-acid" href="/leaderboard">Explore the board <ArrowUpRight size={16} /></Link>
            <Link className="button button-quiet" href="/docs">Read the docs <ArrowRight size={16} /></Link>
          </div>
          <div className="hero-proof">
            <div className="proof-avatars" aria-hidden="true">
              <Avatar name="symbaiex" />
              <Avatar name="open source" />
              <Avatar name="agent systems" />
            </div>
            <span><strong>Built for the visible frontier.</strong><br />A public profile for every private loop.</span>
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-visual-stamp">UM / 001</div>
          <NetworkBoard network={network} />
          <div className="hero-visual-caption"><span className="caption-rule" />A live readout of the open AI workload.</div>
        </div>
      </section>

      <div className="ticker-strip" aria-label="UsageMax product principles">
        <div className="ticker-inner">
          <span>EVENTS, NOT VIBES</span><i />
          <span>TRACE THE WORK</span><i />
          <span>MEASURE THE OUTCOME</span><i />
          <span>SHIP WITH SIGNAL</span><i />
          <span>EVENTS, NOT VIBES</span><i />
          <span>TRACE THE WORK</span>
        </div>
      </div>

      <section className="section shell capabilities-section">
        <div className="section-heading">
          <div className="eyebrow"><span className="eyebrow-line" />One layer, three views</div>
          <h2>Less dashboard. More <span className="text-accent">signal.</span></h2>
          <p>UsageMax turns the messy middle of agent work into a small set of durable, public facts.</p>
        </div>
        <div className="capability-grid">
          <CapabilityCard accent="acid" icon={<ActivityIcon size={21} />} number="01" title="Watch the pulse" description="See requests, tools, outcomes, and live agent state as one connected stream." />
          <CapabilityCard accent="cyan" icon={<ChartLine size={21} />} number="02" title="Know the shape" description="Daily cadence, model mix, spend, and streaks make the work comparable." />
          <CapabilityCard accent="orange" icon={<ShieldCheck size={21} />} number="03" title="Share with proof" description="A public profile that says what happened without exposing what should stay private." />
        </div>
      </section>

      <LeaderboardPreview rows={rows} />

      <section className="section shell symbaiex-feature">
        <div className="symbaiex-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <span className="orbit-core">S</span>
          <span className="art-coordinate art-coordinate-a">30.2672° N</span>
          <span className="art-coordinate art-coordinate-b">97.7431° W</span>
          <span className="art-coordinate art-coordinate-c">LIVE / 07</span>
        </div>
        <div className="symbaiex-copy">
          <div className="eyebrow"><span className="eyebrow-line" />Featured public profile</div>
          <h2>Meet <span className="text-accent">symbaiex.</span></h2>
          <p>A public telemetry profile for an agent-native builder. Follow the daily rhythm, the model choices, and the work happening right now.</p>
          <Link className="button button-outline" href="/symbaiex">Open profile <ArrowUpRight size={16} /></Link>
        </div>
      </section>

      <section className="section shell closing-cta">
        <div className="closing-cta-copy">
          <div className="eyebrow"><span className="eyebrow-line" />The useful layer</div>
          <h2>Telemetry that earns its place in the room.</h2>
        </div>
        <div className="closing-cta-action">
          <p>Start with one collector. Grow into a shared operating picture.</p>
          <Link className="text-link" href="/enterprise">See the team surface <ArrowUpRight size={15} /></Link>
        </div>
      </section>
    </div>
  );
}

export function HomeView() {
  return convexConfigured ? <HomeData /> : <HomeUnavailable />;
}

function MetricToggle({
  metric,
  onChange,
}: {
  metric: Metric;
  onChange: (value: Metric) => void;
}) {
  return (
    <div aria-label="Leaderboard metric" className="segmented-control" role="tablist">
      {(["tokens", "spend"] as Metric[]).map((item) => (
        <button
          aria-selected={metric === item}
          className={metric === item ? "is-selected" : ""}
          key={item}
          onClick={() => onChange(item)}
          role="tab"
          type="button"
        >
          {item === "tokens" ? "Tokens" : "Spend"}
        </button>
      ))}
    </div>
  );
}

function PeriodToggle({
  period,
  onChange,
}: {
  period: Period;
  onChange: (value: Period) => void;
}) {
  return (
    <div aria-label="Leaderboard period" className="period-toggle" role="tablist">
      {(["7d", "30d", "all"] as Period[]).map((item) => (
        <button
          aria-selected={period === item}
          className={period === item ? "is-selected" : ""}
          key={item}
          onClick={() => onChange(item)}
          role="tab"
          type="button"
        >
          {item === "all" ? "All time" : item}
        </button>
      ))}
    </div>
  );
}

function LeaderboardUnavailable() {
  return (
    <div className="page-surface">
      <div className="shell page-intro">
        <div className="eyebrow"><span className="eyebrow-line" />Signal board</div>
        <h1>Ranked by <span className="text-accent">real work.</span></h1>
        <p>Connect the public Convex deployment to load the live board.</p>
      </div>
    </div>
  );
}

function LeaderboardData() {
  const [period, setPeriod] = useState<Period>("7d");
  const [metric, setMetric] = useState<Metric>("tokens");
  const rows = useQuery(api.public.leaderboard, { period, metric, limit: 50 }) as LeaderboardRowData[] | undefined;

  return (
    <div className="page-surface leaderboard-page">
      <section className="shell page-intro leaderboard-intro">
        <div className="eyebrow"><span className="eyebrow-line" />Signal board / ranked</div>
        <h1>Ranked by <span className="text-accent">real work.</span></h1>
        <p>Public telemetry, made legible. Compare the builders and agent systems choosing to show their signal.</p>
        <div className="leaderboard-intro-foot">
          <span><span className="live-dot" /> Updates as collectors report</span>
          <span className="mono-muted">PUBLIC / READ-ONLY</span>
        </div>
      </section>

      <section className="shell leaderboard-workspace">
        <div className="leaderboard-toolbar">
          <MetricToggle metric={metric} onChange={setMetric} />
          <PeriodToggle period={period} onChange={setPeriod} />
        </div>
        <div className="leaderboard-main-grid">
          <div className="panel leaderboard-panel">
            <div className="panel-heading">
              <div>
                <span className="metric-label">Current view</span>
                <h2>{metric === "tokens" ? "Token signal" : "Indexed spend"}</h2>
              </div>
              <span className="panel-count">{rows ? `${rows.length} profiles` : "Syncing"}</span>
            </div>
            <LeaderboardTable loading={rows === undefined} rows={rows} />
          </div>
          <aside className="board-aside">
            <div className="aside-marker">HOW TO READ THIS</div>
            <h2>Signal over spectacle.</h2>
            <p>Rank is calculated from bounded public telemetry windows. It rewards sustained usage, not a one-off spike.</p>
            <div className="aside-list">
              <div><span className="aside-index">01</span><span><strong>Tokens</strong><small>total model tokens observed</small></span></div>
              <div><span className="aside-index">02</span><span><strong>Spend</strong><small>provider cost reported in USD</small></span></div>
              <div><span className="aside-index">03</span><span><strong>Windows</strong><small>7 day, 30 day, and all time</small></span></div>
            </div>
            <Link className="text-link" href="/methodology">Read the methodology <ArrowUpRight size={15} /></Link>
          </aside>
        </div>
      </section>
    </div>
  );
}

export function LeaderboardView() {
  return convexConfigured ? <LeaderboardData /> : <LeaderboardUnavailable />;
}

function DailyChart({ rows, loading }: { rows: DailyRow[]; loading: boolean }) {
  const values = rows.slice(-30).map((row) => valueOrZero(row.totalTokens));
  const hasData = values.some((value) => value > 0);
  const max = Math.max(...values, 1);
  const points = values.length > 1
    ? values.map((value, index) => `${(index / (values.length - 1)) * 100},${96 - (value / max) * 76}`).join(" ")
    : "0,96 100,96";
  const areaPoints = `0,100 ${points} 100,100`;

  return (
    <div className="chart-card panel">
      <div className="chart-card-header">
        <div>
          <span className="metric-label">Daily throughput</span>
          <h3>Tokens over time</h3>
        </div>
        <span className="chart-period">30D</span>
      </div>
      {loading ? (
        <div className="chart-loading"><Skeleton className="skeleton-chart" /></div>
      ) : hasData ? (
        <>
          <svg aria-label="Daily token throughput chart" className="daily-chart" role="img" viewBox="0 0 600 120" preserveAspectRatio="none">
            <defs>
              <linearGradient id="daily-area-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#73e8ff" stopOpacity="0.35" />
                <stop offset="1" stopColor="#73e8ff" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path className="chart-grid-line" d="M0 20H600M0 58H600M0 96H600" />
            <polygon fill="url(#daily-area-fill)" points={areaPoints} />
            <polyline className="daily-line" points={points} />
            <circle className="daily-endpoint" cx="100" cy={96 - (values[values.length - 1] / max) * 76} r="3.5" />
          </svg>
          <div className="chart-axis"><span>{rows[Math.max(0, rows.length - 30)]?.date ? shortDate(rows[Math.max(0, rows.length - 30)].date) : "30 days ago"}</span><span>Today</span></div>
        </>
      ) : (
        <div className="chart-empty"><ActivityIcon size={18} /><span>No daily activity reported yet.</span></div>
      )}
    </div>
  );
}

function UsageHeatmap({ rows, loading }: { rows: DailyRow[]; loading: boolean }) {
  const max = Math.max(...rows.map((row) => valueOrZero(row.totalTokens)), 1);
  const cells = Array.from({ length: 364 }, (_, index): DailyRow | null => {
    const offset = index - Math.max(0, 364 - rows.length);
    return offset >= 0 ? rows[offset] ?? null : null;
  });
  return (
    <div className="heatmap-card panel">
      <div className="chart-card-header">
        <div>
          <span className="metric-label">Consistency map</span>
          <h3>Usage cadence</h3>
        </div>
        <span className="chart-period">1Y</span>
      </div>
      {loading ? <div className="heatmap-loading"><Skeleton className="skeleton-heatmap" /></div> : (
        <>
          <div aria-hidden="true" className="heatmap">
            {cells.map((row, index) => {
              const level = row ? Math.min(4, Math.ceil((valueOrZero(row.totalTokens) / max) * 4)) : 0;
              return <span className={`heat-cell heat-level-${level}`} key={`${row?.date ?? "empty"}-${index}`} />;
            })}
          </div>
          <div className="heatmap-legend"><span>quiet</span><span className="heatmap-key"><i className="heat-level-0" /><i className="heat-level-1" /><i className="heat-level-2" /><i className="heat-level-3" /><i className="heat-level-4" /></span><span>heavy</span></div>
          <p className="sr-only">A one-year heatmap of daily token activity, with brighter cells representing higher usage.</p>
        </>
      )}
    </div>
  );
}

function ModelBreakdown({ models, loading, totalTokens }: { models: ModelRow[]; loading: boolean; totalTokens: number }) {
  return (
    <section className="model-card panel">
      <div className="panel-heading">
        <div><span className="metric-label">Model mix</span><h2>Where the work lands</h2></div>
        <LayersIcon size={20} />
      </div>
      {loading ? <div className="stacked-loading"><Skeleton className="skeleton-line" /><Skeleton className="skeleton-line" /><Skeleton className="skeleton-line" /></div> : models.length ? (
        <div className="model-list">
          {models.slice(0, 8).map((model) => {
            const share = totalTokens > 0 ? Math.round((model.totalTokens / totalTokens) * 100) : 0;
            return (
              <div className="model-row" key={`${model.provider}-${model.model}`}>
                <div className="model-row-heading"><span><strong>{formatModel(model.model)}</strong><small>{model.provider} / {compactNumber(model.requests)} requests</small></span><strong>{compactNumber(model.totalTokens, 2)}</strong></div>
                <div className="model-bar"><span style={{ width: `${Math.max(share, model.totalTokens > 0 ? 2 : 0)}%` }} /></div>
                <div className="model-row-foot"><span>{share}% of tokens</span><span>{currencyFromMicros(model.costMicros)}</span></div>
              </div>
            );
          })}
        </div>
      ) : <div className="empty-inline"><DatabaseIcon size={18} /> No model totals yet.</div>}
    </section>
  );
}

function AgentList({ agents, loading }: { agents: AgentRow[]; loading: boolean }) {
  return (
    <section className="agents-card panel">
      <div className="panel-heading">
        <div><span className="metric-label">Live now</span><h2>Agent activity</h2></div>
        <span className="panel-count"><span className="live-dot" />{loading ? "Syncing" : `${agents.filter((agent) => agent.online).length} online`}</span>
      </div>
      {loading ? <div className="agent-loading"><Skeleton className="skeleton-agent" /><Skeleton className="skeleton-agent" /></div> : agents.length ? (
        <div className="agent-list">
          {agents.map((agent) => (
            <div className={`agent-row ${agent.online ? "agent-online" : ""}`} key={agent.externalId}>
              <span className="agent-pulse"><span /></span>
              <span className="agent-main"><strong>{agent.name}</strong><small>{agent.task || sentenceCase(agent.state)} / {formatModel(agent.model)}</small></span>
              <span className="agent-rate"><strong>{compactNumber(agent.tokensPerSecond, 1)}</strong><small>tok / sec</small></span>
              <span className="agent-state">{agent.online ? "online" : "idle"}</span>
            </div>
          ))}
        </div>
      ) : <div className="empty-inline"><PulseIcon size={18} /> No active agents in this window.</div>}
    </section>
  );
}

function EventStream({ events, loading }: { events: EventRow[]; loading: boolean }) {
  return (
    <section className="events-card panel">
      <div className="panel-heading">
        <div><span className="metric-label">Latest trace events</span><h2>What just happened</h2></div>
        <span className="panel-count">{loading ? "Syncing" : `${events.length} recent`}</span>
      </div>
      {loading ? <div className="event-loading"><Skeleton className="skeleton-event" /><Skeleton className="skeleton-event" /><Skeleton className="skeleton-event" /></div> : events.length ? (
        <div className="event-list">
          {events.slice(0, 12).map((event) => (
            <div className="event-row" key={event._id || event.eventKey}>
              <span className={`event-status event-status-${event.status}`}><span /></span>
              <span className="event-type">{sentenceCase(event.eventType)}</span>
              <span className="event-description"><strong>{event.agentName || event.source}</strong><small>{formatModel(event.model)}{event.task ? ` / ${event.task}` : ""}</small></span>
              <span className="event-metric"><strong>{compactNumber(event.totalTokens, 2)}</strong><small>{event.latencyMs ? `${event.latencyMs}ms` : currencyFromMicros(event.costMicros)}</small></span>
              <time dateTime={new Date(event.occurredAt).toISOString()}>{relativeTime(new Date(event.occurredAt))}</time>
            </div>
          ))}
        </div>
      ) : <div className="empty-inline"><ActivityIcon size={18} /> No trace events in this window.</div>}
    </section>
  );
}

function ProfileLoading({ handle }: { handle: string }) {
  return (
    <div className="page-surface profile-page">
      <section className="shell profile-hero profile-loading-hero">
        <div className="profile-identity"><Skeleton className="skeleton-profile-avatar" /><div><Skeleton className="skeleton-line skeleton-line-wide" /><Skeleton className="skeleton-line" /><Skeleton className="skeleton-line skeleton-line-wide" /></div></div>
        <div className="profile-loading-note"><span className="live-dot" /> Loading @{handle}</div>
      </section>
      <section className="shell profile-section"><div className="profile-loading-grid"><Skeleton className="skeleton-profile-panel" /><Skeleton className="skeleton-profile-panel" /></div></section>
    </div>
  );
}

function ProfileNotFound({ handle }: { handle: string }) {
  return (
    <div className="page-surface profile-page">
      <section className="shell not-found-card panel">
        <div className="not-found-code">404 / PUBLIC PROFILE</div>
        <h1>No signal for <span className="text-accent">@{handle}</span>.</h1>
        <p>This profile is private, hasn&apos;t connected a collector, or doesn&apos;t exist yet.</p>
        <div className="hero-actions"><Link className="button button-acid" href="/leaderboard">Browse the board <ArrowUpRight size={16} /></Link><Link className="button button-quiet" href="/docs">Connect a profile <ArrowRight size={16} /></Link></div>
      </section>
    </div>
  );
}

function ProfileUnavailable({ handle }: { handle: string }) {
  return (
    <div className="page-surface profile-page">
      <section className="shell not-found-card panel"><div className="not-found-code">PUBLIC PROFILE / PAUSED</div><h1>Signal pending for <span className="text-accent">@{handle}</span>.</h1><p>Connect the public Convex deployment to see this profile&apos;s live telemetry.</p></section>
    </div>
  );
}

function ProfileDataView({ handle }: { handle: string }) {
  const normalizedHandle = handle.replace(/^@/, "").toLowerCase();
  const profileResult = useQuery(api.public.profile, { handle: normalizedHandle }) as ProfileData | null | undefined;
  const dailyResult = useQuery(api.public.daily, { handle: normalizedHandle, days: 365 }) as DailyRow[] | undefined;
  const [now, setNow] = useState(0);

  useEffect(() => {
    const refresh = () => setNow(Date.now());
    refresh();
    const interval = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(interval);
  }, []);

  const liveResult = useQuery(
    api.public.live,
    now ? { handle: normalizedHandle, now, agentLimit: 8, eventLimit: 20 } : "skip",
  ) as LiveData | undefined;

  if (profileResult === undefined) return <ProfileLoading handle={normalizedHandle} />;
  if (profileResult === null) return <ProfileNotFound handle={normalizedHandle} />;

  const profile = profileResult.profile;
  const stats = profileResult.stats;
  const daily = dailyResult ?? [];
  const live = liveResult ?? { agents: [], events: [] };
  const onlineAgents = live.agents.filter((agent) => agent.online);

  return (
    <div className="page-surface profile-page">
      <section className="shell profile-hero">
        <div className="profile-identity">
          <div className="profile-avatar-frame"><Avatar name={profile.displayName || profile.handle} size="large" /><span className="profile-avatar-signal" /></div>
          <div className="profile-copy">
            <div className="eyebrow"><span className="eyebrow-line" />Public telemetry profile</div>
            <div className="profile-title-line"><h1>{profile.displayName || profile.handle}</h1>{profile.isVerified ? <VerifyBadge /> : null}</div>
            <p className="profile-handle">@{profile.handle} <span>/</span> {profile.verification} signal</p>
            <p className="profile-bio">{profile.bio || "An open telemetry profile for an AI-native builder."}</p>
            <div className="profile-meta"><span>First seen {profileResult.stats?.firstDay ? shortDate(profileResult.stats.firstDay) : "recently"}</span><span className="meta-divider" /><span>Updated {stats?.lastEventAt ? relativeTime(new Date(stats.lastEventAt)) : "on ingest"}</span></div>
          </div>
        </div>
        <div className="profile-live-card">
          <div className="profile-live-card-top"><span className="live-chip"><span className="live-dot" />Live feed</span><span className="mono-muted">15 SEC</span></div>
          <strong>{onlineAgents.length}</strong>
          <span>active agent{onlineAgents.length === 1 ? "" : "s"} right now</span>
          <div className="mini-wave" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
          <small>{now ? "Watching the latest public heartbeat" : "Starting live listener"}</small>
        </div>
      </section>

      <section className="shell profile-stat-grid" aria-label="Profile totals">
        <div className="profile-stat profile-stat-featured"><span className="metric-label">Total tokens</span><strong>{compactNumber(valueOrZero(stats?.totalTokens), 2)}</strong><small>all observed model work</small></div>
        <div className="profile-stat"><span className="metric-label">Indexed spend</span><strong>{currencyFromMicros(valueOrZero(stats?.totalCostMicros))}</strong><small>reported provider cost</small></div>
        <div className="profile-stat"><span className="metric-label">Sessions</span><strong>{compactNumber(valueOrZero(stats?.sessions))}</strong><small>{compactNumber(valueOrZero(stats?.activeDays))} active days</small></div>
        <div className="profile-stat"><span className="metric-label">Current streak</span><strong>{valueOrZero(stats?.currentStreakDays)}<em>d</em></strong><small>best {valueOrZero(stats?.longestStreakDays)} days</small></div>
      </section>

      <section className="shell profile-section">
        <div className="section-heading section-heading-row"><div><div className="eyebrow"><span className="eyebrow-line" />Cadence / volume</div><h2>Show your work over time.</h2></div><span className="section-side-note">{daily.length ? `${daily.length} days indexed` : "No daily rollup yet"}</span></div>
        <div className="profile-activity-grid"><DailyChart loading={dailyResult === undefined} rows={daily} /><UsageHeatmap loading={dailyResult === undefined} rows={daily} /></div>
      </section>

      <section className="shell profile-lower-grid">
        <ModelBreakdown loading={profileResult.models === undefined} models={profileResult.models ?? []} totalTokens={valueOrZero(stats?.totalTokens)} />
        <AgentList loading={liveResult === undefined} agents={live.agents} />
      </section>

      <section className="shell profile-section profile-events-section"><div className="section-heading section-heading-row"><div><div className="eyebrow"><span className="eyebrow-line" />Trace surface</div><h2>Live events, without the noise.</h2></div><span className="section-side-note">Public fields only / bounded feed</span></div><EventStream events={live.events} loading={liveResult === undefined} /></section>

      <section className="shell profile-footer-note"><div><span className="icon-chip icon-chip-cyan"><LockClosed size={17} /></span><span><strong>Privacy by construction.</strong><small>This profile exposes aggregated usage and selected event context—not prompts, payloads, or credentials.</small></span></div><Link className="text-link" href="/methodology">Understand the data <ArrowUpRight size={15} /></Link></section>
    </div>
  );
}

export function ProfileView({ handle }: { handle: string }) {
  return convexConfigured ? <ProfileDataView handle={handle} /> : <ProfileUnavailable handle={handle.replace(/^@/, "").toLowerCase()} />;
}
