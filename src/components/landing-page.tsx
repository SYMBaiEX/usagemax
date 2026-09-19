"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";

import { api } from "../../convex/_generated/api";
import { compactNumber, currencyFromMicros } from "@/lib/format";
import { AuthNavigation } from "./auth-navigation";
import { ArrowRight, ArrowUpRight, LockClosed, UsageMark } from "./icons";
import styles from "./landing-page.module.css";
import { CopyButton } from "./copy-button";
import { TokenInstrument } from "./token-instrument";
import { ProfileAvatar } from "./profile-avatar";
import { TeamsShowcase } from "./teams-showcase";
import { CodeField } from "./code-field";
import { MotionSurface } from "./motion-surface";
import { WebMcpTools } from "./webmcp-tools";

type Network = FunctionReturnType<typeof api.public.network>;
type Ranking = FunctionReturnType<typeof api.public.leaderboard>;
type Period = "7d" | "30d" | "all";
type Metric = "tokens" | "spend";

import { rankingValues } from "@/lib/chart-data";

const sources = ["Claude Code", "Codex", "Gemini CLI", "OpenCode", "Copilot CLI", "Hermes"];

function NetworkRecord({ network, connected }: { network?: Network; connected: boolean }) {
  return (
    <section className={`${styles.wrap} ${styles.network}`} aria-label="Live UsageMax network totals">
      <div className={styles.networkLabel}><UsageMark size={24} /><div><strong>The UsageMax network</strong><span className={styles.status}><i data-ready={Boolean(network)} />{network ? "First-party data" : connected ? "Connecting to network" : "Network unavailable"}</span></div></div>
      <dl className={styles.networkStats}>
        <div><dt>Tokens counted</dt><dd>{network ? compactNumber(network.totalTokens, 2) : "—"}</dd></div>
        <div><dt>Sessions recorded</dt><dd>{network ? compactNumber(network.totalSessions) : "—"}</dd></div>
        <div><dt>Tracked cost¹</dt><dd>{network ? currencyFromMicros(network.totalCostMicros) : "—"}</dd></div>
      </dl>
      <p className={styles.costNote}>Across connected accounts · all time.<br />¹ Reported or API-equivalent estimates. Not an invoice. <Link href="/methodology">How we count <ArrowUpRight size={11} /></Link></p>
    </section>
  );
}

function PublicLedger({ rows, period, metric, setPeriod, setMetric, connected }: {
  rows?: Ranking;
  period: Period;
  metric: Metric;
  setPeriod: (value: Period) => void;
  setMetric: (value: Metric) => void;
  connected: boolean;
}) {
  return (
    <section className={`${styles.wrap} ${styles.ledger}`} aria-labelledby="public-ledger-title">
      <div className={styles.ledgerIntro}>
        <h2 id="public-ledger-title">Leaderboard</h2>
        <Link className={styles.textLink} href="/leaderboard">View all <ArrowUpRight size={15} /></Link>
      </div>
      <div className={styles.board}>
        <div className={styles.boardControls}>
          <div className={styles.metricTabs} role="group" aria-label="Rank profiles by">
            <button type="button" aria-pressed={metric === "tokens"} onClick={() => setMetric("tokens")}>Tokens</button>
            <button type="button" aria-pressed={metric === "spend"} onClick={() => setMetric("spend")}>Tracked cost</button>
          </div>
          <label className={styles.period}>
            <span className="sr-only">Ranking period</span>
            <select value={period} onChange={(event) => setPeriod(event.target.value as Period)}>
              <option value="all">All time</option>
              <option value="30d">Last 30 days</option>
              <option value="7d">Last 7 days</option>
            </select>
          </label>
        </div>
        <div className={styles.tableViewport}>
          <table className={styles.table} aria-label="Public UsageMax rankings" aria-busy={connected && rows === undefined}>
            <thead><tr><th scope="col">Rank</th><th scope="col">Builder</th><th scope="col" aria-sort={metric === "tokens" ? "descending" : "none"}>Tokens<small>{metric === "tokens" && period !== "all" ? period : "All time"}</small></th><th scope="col" aria-sort={metric === "spend" ? "descending" : "none"}>Cost¹<small>{metric === "spend" && period !== "all" ? period : "All time"}</small></th><th scope="col" className={styles.sessions}>Sessions<small>All time</small></th></tr></thead>
            <tbody>
              {rows?.length ? rows.map((row, index) => (
                <tr key={row.handle}>
                  <td className={styles.rank}>{String(index + 1).padStart(2, "0")}</td>
                  <td><Link className={styles.person} href={`/${row.handle}`}>
                    <ProfileAvatar handle={row.handle} />
                    <span><strong>{row.displayName || row.handle}{row.verification === "verified" ? <span className={styles.verified} aria-label="Verified account">✓</span> : null}</strong><small>@{row.handle}</small></span>
                    <ArrowUpRight size={13} />
                  </Link></td>
                  <td className={metric === "tokens" ? styles.sorted : undefined}>{compactNumber(rankingValues(row).tokens, 2)}</td>
                  <td className={metric === "spend" ? styles.sorted : undefined}>{currencyFromMicros(rankingValues(row).costMicros)}</td>
                  <td className={styles.sessions}>{compactNumber(row.sessions)}</td>
                </tr>
              )) : <tr><td colSpan={5} className={styles.empty} role="status">{!connected ? "Public rankings are temporarily unavailable." : rows === undefined ? "Loading the public ledger…" : "No public profiles in this period yet."}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className={styles.boardFooter}>
          <span>Public profiles only.</span>
          <AuthNavigation href="/sign-up">Create profile <ArrowRight size={14} /></AuthNavigation>
        </div>
        <p className={styles.boardNote}>¹ Costs may include API-equivalent estimates, not subscription bills.</p>
      </div>
    </section>
  );
}

function LandingContent({ network, rows, period, metric, setPeriod, setMetric, connected }: {
  network?: Network;
  rows?: Ranking;
  period: Period;
  metric: Metric;
  setPeriod: (value: Period) => void;
  setMetric: (value: Metric) => void;
  connected: boolean;
}) {
  return (
    <div className={styles.page}>
      <WebMcpTools />
      <div hidden aria-hidden="true">
        <form {...({ toolname: "usagemax_network_stats", tooldescription: "Read bounded public UsageMax network statistics." } as Record<string, string>)} action="/api/stats" method="get"><button type="submit">Read network stats</button></form>
        <form {...({ toolname: "usagemax_leaderboard", tooldescription: "Read the bounded public UsageMax leaderboard." } as Record<string, string>)} action="/api/leaderboard" method="get"><button type="submit">Read leaderboard</button></form>
        <form {...({ toolname: "usagemax_ask", tooldescription: "Ask a bounded question about public UsageMax documentation and receive cited resources." } as Record<string, string>)} action="/ask" method="get"><label>Question <input name="query" type="text" minLength={1} maxLength={500} /></label><button type="submit">Ask UsageMax</button></form>
        <form {...({ toolname: "usagemax_sandbox_validate", tooldescription: "Validate content-free UsageMax telemetry without writing data." } as Record<string, string>)} action="/api/v1/sandbox/validate" method="post"><button type="submit">Validate telemetry</button></form>
      </div>
      <section className={styles.hero} aria-labelledby="landing-title" data-webmcp="document.modelContext.registerTool">
        <div className={`${styles.wrap} ${styles.heroInner}`}>
        <div className={styles.heroCopy}>
          <h1 id="landing-title">Your AI work.<br /><span>On the record.</span></h1>
          <p>Track tokens and costs across your models and computers. Free for individuals and small teams. No card required.</p>
          <div className={styles.heroActions}>
            <AuthNavigation className={styles.primaryButton} href="/sign-up">Start tracking <ArrowUpRight size={17} /></AuthNavigation>
            <Link className={styles.textLink} href="/leaderboard">Leaderboard <ArrowRight size={16} /></Link>
            <Link className={styles.textLink} href="/?mode=agent" rel="alternate" type="application/json" aria-label="Open UsageMax agent mode">Agent mode <ArrowUpRight size={16} /></Link>
            <Link className={styles.textLink} href="/sandbox">Try the no-write sandbox <ArrowUpRight size={16} /></Link>
          </div>
          <span className={styles.privacy}><LockClosed size={13} /> Private by default. Public when you choose.</span>
        </div>
        <div className={styles.instrumentStage}>
          <CodeField />
          <div className={styles.stageLabel} aria-hidden="true"><span>USAGEMAX / NETWORK RECORD</span><span>READ-ONLY INSTRUMENT</span></div>
          <MotionSurface parallax><TokenInstrument totals={network} /></MotionSurface>
          <div className={styles.stageReadout}><code><span>usage.network</span> {"{"} tokens: <b>{network ? compactNumber(network.totalTokens, 2) : "null"}</b>, sessions: <b>{network ? compactNumber(network.totalSessions, 2) : "null"}</b> {"}"}</code><span>Source: connected accounts</span></div>
        </div>
        </div>
      </section>

      <NetworkRecord network={network} connected={connected} />

      <div className={`${styles.wrap} ${styles.sources}`}>
        <span>Integrations</span>
        <ul aria-label="Supported local coding agents">{sources.map((source) => <li key={source}>{source}</li>)}</ul>
        <Link href="/docs">16 local sources <ArrowUpRight size={12} /></Link>
        <Link href="/integrations">Integration guide <ArrowUpRight size={12} /></Link>
        <Link href="/cli.md">CLI <ArrowUpRight size={12} /></Link>
        <Link href="/openapi.json">OpenAPI <ArrowUpRight size={12} /></Link>
        <Link href="/auth.md">Auth <ArrowUpRight size={12} /></Link>
        <Link href="/pricing.md">Pricing <ArrowUpRight size={12} /></Link>
        <Link href="https://registry.modelcontextprotocol.io/v0.1/servers/io.github.SYMBaiEX%2Fusagemax/versions/latest" rel="external">MCP Registry <ArrowUpRight size={12} /></Link>
      </div>

      <MotionSurface><PublicLedger rows={rows} period={period} metric={metric} setPeriod={setPeriod} setMetric={setMetric} connected={connected} /></MotionSurface>

      <section className={styles.connectBand} aria-labelledby="connect-title">
        <div className={`${styles.wrap} ${styles.connect}`}>
          <div className={styles.setup}>
            <div className={styles.command}>
              <div className={styles.terminalTop}><span><i /><i /><i /></span><span>usagemax / terminal</span></div>
              <div className={styles.commandBody}><code><span aria-hidden="true">↳ </span>bunx usagemax</code><CopyButton value="bunx usagemax" /></div>
              <p>Run again to sync a linked computer.</p>
            </div>
            <ol className={styles.steps}>
              <li><span>01</span><div><h3>Sign in</h3><p>Use GitHub or Google.</p></div></li>
              <li><span>02</span><div><h3>Link each computer</h3><p>Run the one-time command from your account.</p></div></li>
              <li><span>03</span><div><h3>Sync usage</h3><p>Only aggregate counts are uploaded. Publishing your profile is optional.</p></div></li>
            </ol>
            <p className={styles.resourceNote}>One-shot syncs. No always-running background scanner.</p>
          </div>
          <div className={styles.connectCopy}>
            <h2 id="connect-title">Connect your computers.</h2>
            <p>Free for individuals and small teams. No card required.</p>
            <Link className={styles.textLink} href="/docs">Setup guide <ArrowUpRight size={15} /></Link>
          </div>
        </div>
      </section>

      <div className={styles.wrap}><MotionSurface><TeamsShowcase /></MotionSurface></div>
    </div>
  );
}

function ConnectedLanding() {
  const [period, setPeriod] = useState<Period>("all");
  const [metric, setMetric] = useState<Metric>("tokens");
  const network = useQuery(api.public.network, {});
  const rows = useQuery(api.public.leaderboard, { period, metric, limit: 5 });
  return <LandingContent network={network} rows={rows} period={period} metric={metric} setPeriod={setPeriod} setMetric={setMetric} connected />;
}

function UnconnectedLanding() {
  const [period, setPeriod] = useState<Period>("all");
  const [metric, setMetric] = useState<Metric>("tokens");
  return <LandingContent period={period} metric={metric} setPeriod={setPeriod} setMetric={setMetric} connected={false} />;
}

export function LandingPage() {
  return process.env.NEXT_PUBLIC_CONVEX_URL ? <ConnectedLanding /> : <UnconnectedLanding />;
}
