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

type Network = FunctionReturnType<typeof api.public.network>;
type Ranking = FunctionReturnType<typeof api.public.leaderboard>;
type Period = "7d" | "30d" | "all";
type Metric = "tokens" | "spend";

const sources = ["Claude Code", "Codex", "Gemini CLI", "OpenCode", "Copilot CLI", "Hermes"];

function NetworkRecord({ network, connected }: { network?: Network; connected: boolean }) {
  return (
    <figure className={styles.record} aria-label="Live UsageMax network totals">
      <div className={styles.recordBacking} aria-hidden="true"><span>EVERY TOKEN HAS A STORY.</span></div>
      <div className={styles.recordPaper}>
        <div className={styles.recordHeading}>
          <span><UsageMark size={23} /> Usage record</span>
          <span className={styles.recordEdition}>UM / 001</span>
        </div>
        <div className={styles.recordTotal}>
          <span>Tokens counted</span>
          <strong>{network ? compactNumber(network.totalTokens, 2) : "—"}</strong>
          <small>Across connected accounts · all time</small>
        </div>
        <dl className={styles.recordDetails}>
          <div><dt>Tracked cost¹</dt><dd>{network ? currencyFromMicros(network.totalCostMicros) : "—"}</dd></div>
          <div><dt>Sessions recorded</dt><dd>{network ? network.totalSessions.toLocaleString("en-US") : "—"}</dd></div>
          <div><dt>Connected profiles</dt><dd>{network ? network.profiles.toLocaleString("en-US") : "—"}</dd></div>
        </dl>
        <div className={styles.recordFoot}>
          <span className={styles.status}><i data-ready={Boolean(network)} />{network ? "First-party data" : connected ? "Connecting to network" : "Network unavailable"}</span>
          <span className={styles.recordBars} aria-hidden="true" />
        </div>
        <p className={styles.costNote}>¹ Reported or API-equivalent estimates.<br />Not an invoice. <Link href="/methodology">How we count <ArrowUpRight size={11} /></Link></p>
      </div>
    </figure>
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
        <span className={styles.eyebrow}>The public ledger</span>
        <h2 id="public-ledger-title">Meet the people<br /> putting AI to work.</h2>
        <p>Real usage. Open profiles.<br /> A little friendly competition.</p>
        <Link className={styles.textLink} href="/leaderboard">Explore everyone <ArrowUpRight size={15} /></Link>
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
            <thead><tr><th scope="col">Rank</th><th scope="col">Builder</th><th scope="col" aria-sort={metric === "tokens" ? "descending" : "none"}>Tokens</th><th scope="col" aria-sort={metric === "spend" ? "descending" : "none"}>Cost¹</th><th scope="col" className={styles.sessions}>Sessions</th></tr></thead>
            <tbody>
              {rows?.length ? rows.map((row, index) => (
                <tr key={row.handle}>
                  <td className={styles.rank}>{String(index + 1).padStart(2, "0")}</td>
                  <td><Link className={styles.person} href={`/${row.handle}`}>
                    <span className={styles.avatar} aria-hidden="true">{(row.displayName || row.handle).slice(0, 2).toUpperCase()}</span>
                    <span><strong>{row.displayName || row.handle}{row.verification === "verified" ? <span className={styles.verified} aria-label="Verified account">✓</span> : null}</strong><small>@{row.handle}</small></span>
                    <ArrowUpRight size={13} />
                  </Link></td>
                  <td className={metric === "tokens" ? styles.sorted : undefined}>{compactNumber(row.totalTokens, 2)}</td>
                  <td className={metric === "spend" ? styles.sorted : undefined}>{currencyFromMicros(row.totalCostMicros)}</td>
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
      <section className={`${styles.wrap} ${styles.hero}`} aria-labelledby="landing-title">
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}><span className={styles.plus} aria-hidden="true">+</span> A clearer picture of your AI usage</span>
          <h1 id="landing-title">You build.<br />We keep <span>count.</span></h1>
          <p>Your tokens, models, and costs. Across your agents and machines. Finally, in one place.</p>
          <div className={styles.heroActions}>
            <AuthNavigation className={styles.primaryButton} href="/sign-up">Start your record <ArrowUpRight size={17} /></AuthNavigation>
            <Link className={styles.textLink} href="/leaderboard">Explore the leaderboard <ArrowRight size={16} /></Link>
          </div>
          <span className={styles.privacy}><LockClosed size={13} /> Private by default. Public when you choose.</span>
        </div>
        <NetworkRecord network={network} connected={connected} />
      </section>

      <div className={`${styles.wrap} ${styles.sources}`}>
        <span>Works where you work</span>
        <ul aria-label="Supported local coding agents">{sources.map((source) => <li key={source}>{source}</li>)}</ul>
        <Link href="/docs">16 local sources <ArrowUpRight size={12} /></Link>
      </div>

      <PublicLedger rows={rows} period={period} metric={metric} setPeriod={setPeriod} setMetric={setMetric} connected={connected} />

      <section className={styles.connectBand} aria-labelledby="connect-title">
        <div className={`${styles.wrap} ${styles.connect}`}>
          <div className={styles.connectCopy}>
            <span className={styles.eyebrow}>Your history. Not your prompts.</span>
            <h2 id="connect-title">Less setup.<br /> More perspective.</h2>
            <p>Link your computers to one account. See your model mix, spending, and activity without uploading the work itself.</p>
            <Link className={styles.textLink} href="/security">See what stays private <ArrowUpRight size={15} /></Link>
          </div>
          <div className={styles.setup}>
            <ol className={styles.steps}>
              <li><span>01</span><div><h3>Make it yours.</h3><p>Sign in with GitHub or Google. Your profile starts private.</p></div></li>
              <li><span>02</span><div><h3>Link a machine.</h3><p>Copy a one-time command from your account. Repeat on your other computers.</p></div></li>
              <li><span>03</span><div><h3>See the whole picture.</h3><p>Sync retained usage. Compare models and costs. Publish your profile only if you want to.</p></div></li>
            </ol>
            <div className={styles.command}>
              <div><span>Already connected? Sync again with</span><code><span aria-hidden="true">$ </span>bunx usagemax</code></div>
              <Link href="/docs" aria-label="Read the UsageMax CLI documentation"><ArrowUpRight size={20} /></Link>
            </div>
            <p className={styles.resourceNote}>One-shot syncs. No always-running background scanner.</p>
          </div>
        </div>
      </section>

      <section className={`${styles.wrap} ${styles.teams}`} aria-labelledby="teams-title">
        <span className={styles.eyebrow}>For teams</span>
        <div><h2 id="teams-title">Same clarity. At company scale.</h2><p>Private workspaces, scoped access, and a shared view of AI usage.</p></div>
        <Link className={styles.teamLink} href="/enterprise">UsageMax for teams <ArrowUpRight size={17} /></Link>
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
