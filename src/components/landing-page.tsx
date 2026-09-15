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
import { CtaArtwork } from "./cta-artwork";
import { CodeField } from "./code-field";

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
        <div><span className={styles.eyebrow}>The public ledger</span><h2 id="public-ledger-title">Good company.<br /><span>Great numbers.</span></h2></div>
        <div><p>Behind every number, a builder.<br />Explore their models, habits, and milestones.</p><Link className={styles.textLink} href="/leaderboard">Meet the builders <ArrowUpRight size={15} /></Link></div>
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
          <span>Only profiles that choose to be public.</span>
          <AuthNavigation href="/sign-up">Make your mark <ArrowRight size={14} /></AuthNavigation>
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
      <section className={styles.hero} aria-labelledby="landing-title">
        <div className={`${styles.wrap} ${styles.heroInner}`}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}><span className={styles.plus} aria-hidden="true">↗</span> For the ones building with AI</span>
          <h1 id="landing-title">Your AI work.<br /><span>On the record.</span></h1>
          <p>All your tokens, models, and machines.<br />One picture of what you’re putting into the world.</p>
          <div className={styles.heroActions}>
            <AuthNavigation className={styles.primaryButton} href="/sign-up">Start tracking <ArrowUpRight size={17} /></AuthNavigation>
            <Link className={styles.textLink} href="/leaderboard">Look around <ArrowRight size={16} /></Link>
          </div>
          <span className={styles.privacy}><LockClosed size={13} /> Private by default. Public when you choose.</span>
        </div>
        <div className={styles.instrumentStage}>
          <CodeField />
          <div className={styles.stageLabel} aria-hidden="true"><span>USAGEMAX / NETWORK RECORD</span><span>READ-ONLY INSTRUMENT</span></div>
          <TokenInstrument totals={network} />
          <div className={styles.stageReadout}><code><span>usage.network</span> {"{"} tokens: <b>{network ? compactNumber(network.totalTokens, 2) : "null"}</b>, sessions: <b>{network ? compactNumber(network.totalSessions, 2) : "null"}</b> {"}"}</code><span>Source: connected accounts</span></div>
        </div>
        </div>
        <div className={styles.heroCoordinates} aria-hidden="true"><span>USAGE, WITHOUT THE GUESSWORK</span><span>ONE RECORD. EVERY MACHINE.</span></div>
      </section>

      <NetworkRecord network={network} connected={connected} />

      <div className={`${styles.wrap} ${styles.sources}`}>
        <span>Works where you work</span>
        <ul aria-label="Supported local coding agents">{sources.map((source) => <li key={source}>{source}</li>)}</ul>
        <Link href="/docs">16 local sources <ArrowUpRight size={12} /></Link>
      </div>

      <PublicLedger rows={rows} period={period} metric={metric} setPeriod={setPeriod} setMetric={setMetric} connected={connected} />

      <section className={styles.connectBand} aria-labelledby="connect-title">
        <div className={`${styles.wrap} ${styles.connect}`}>
          <div className={styles.connectCopy}>
            <span className={styles.eyebrow}>A small command. A bigger picture.</span>
            <h2 id="connect-title">Plug in.<br /><span>Zoom out.</span></h2>
            <p>Link your computers to one account. See your model mix, spending, and activity without uploading the work itself.</p>
            <Link className={styles.textLink} href="/security">See what stays private <ArrowUpRight size={15} /></Link>
          </div>
          <div className={styles.setup}>
            <div className={styles.command}>
              <div className={styles.terminalTop}><span><i /><i /><i /></span><span>usagemax / terminal</span></div>
              <div className={styles.commandBody}><code><span aria-hidden="true">↳ </span>bunx usagemax</code><CopyButton value="bunx usagemax" /></div>
              <p>Already linked? One command syncs your retained usage.</p>
            </div>
            <ol className={styles.steps}>
              <li><span>01</span><div><h3>Make it yours.</h3><p>Sign in with GitHub or Google. Your profile starts private.</p></div></li>
              <li><span>02</span><div><h3>Link a machine.</h3><p>Copy a one-time command from your account. Repeat on your other computers.</p></div></li>
              <li><span>03</span><div><h3>See the whole picture.</h3><p>Sync retained usage. Compare models and costs. Publish your profile only if you want to.</p></div></li>
            </ol>
            <p className={styles.resourceNote}>One-shot syncs. No always-running background scanner.</p>
          </div>
        </div>
      </section>

      <section className={`${styles.wrap} ${styles.teams}`} aria-labelledby="teams-title">
        <div className={styles.teamArt}><CtaArtwork /><CodeField /></div>
        <div><span className={styles.eyebrow}>Independent builders. Entire teams.</span><h2 id="teams-title">Big picture.<br />Tight boundaries.</h2><p>Understand AI usage across your organization. Keep the work itself where it belongs.</p><Link className={styles.teamLink} href="/enterprise">Meet UsageMax for teams <ArrowUpRight size={17} /></Link></div>
      </section>
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
