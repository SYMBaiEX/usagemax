import Link from "next/link";
import type { ReactNode } from "react";

import { PageIntro, TextLink } from "./site-shell";
import {
  ActivityIcon,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  ChartLine,
  CodeBrackets,
  DatabaseIcon,
  LayersIcon,
  LockClosed,
  PulseIcon,
  ShieldCheck,
  Sparkles,
} from "./icons";

function DetailCard({
  index,
  icon,
  title,
  children,
  accent = "acid",
}: {
  index: string;
  icon: ReactNode;
  title: string;
  children: ReactNode;
  accent?: "acid" | "cyan" | "orange";
}) {
  return (
    <article className={`detail-card detail-card-${accent}`}>
      <div className="detail-card-top"><span>{index}</span><span className="detail-card-icon">{icon}</span></div>
      <h3>{title}</h3>
      <div className="detail-card-copy">{children}</div>
    </article>
  );
}

function Callout({ children, tone = "acid" }: { children: ReactNode; tone?: "acid" | "cyan" }) {
  return <div className={`content-callout content-callout-${tone}`}><span className="callout-dot" />{children}</div>;
}

export function EnterpriseView() {
  return (
    <div className="page-surface content-page enterprise-page">
      <PageIntro
        description="A calm operating picture for teams running models, tools, and autonomous systems in production. UsageMax gives everyone the same signal without asking anyone to give up the source data."
        eyebrow="For teams / the control plane"
        title={<>Make the invisible workload <span className="text-accent">operational.</span></>}
      >
        <Link className="button button-acid" href="/docs">Start with the collector <ArrowUpRight size={16} /></Link>
        <a className="button button-quiet" href="mailto:hello@usagemax.com">Talk to the team <ArrowRight size={16} /></a>
      </PageIntro>

      <section className="shell enterprise-signal-band">
        <div className="enterprise-signal-readout"><span className="metric-label">Team signal / now</span><strong>ONE SHARED PICTURE</strong><span><span className="live-dot" /> Built from the events already moving through your stack</span></div>
        <div className="enterprise-signal-line" aria-hidden="true"><span /><span /><span /><span /><span /><span /><span /><span /><span /></div>
      </section>

      <section className="shell content-section">
        <div className="section-heading"><div className="eyebrow"><span className="eyebrow-line" />Why UsageMax</div><h2>Clarity without <span className="text-accent">surveillance.</span></h2><p>Built for the tension between useful instrumentation and responsible boundaries.</p></div>
        <div className="detail-grid detail-grid-three">
          <DetailCard accent="acid" icon={<PulseIcon size={21} />} index="01" title="One telemetry layer"><p>Normalize model requests, tool calls, state changes, and outcomes into a readable event surface.</p><p>Keep the provider sprawl and internal naming conventions behind the signal.</p></DetailCard>
          <DetailCard accent="cyan" icon={<LayersIcon size={21} />} index="02" title="Every level of context"><p>Give an operator the current pulse, a team the weekly shape, and leadership a durable view of where effort lands.</p><p>Same source. Different resolution.</p></DetailCard>
          <DetailCard accent="orange" icon={<LockClosed size={21} />} index="03" title="Bounded by design"><p>Public profiles expose aggregates and selected event context. Prompts, payloads, keys, and private traces stay out of the public surface.</p><p>Less data to guard is a useful control.</p></DetailCard>
        </div>
      </section>

      <section className="shell content-section enterprise-steps">
        <div className="section-heading"><div className="eyebrow"><span className="eyebrow-line" />The rollout</div><h2>Start narrow. <span className="text-accent">See sooner.</span></h2></div>
        <div className="steps-list">
          <div className="step-row"><span className="step-number">01</span><div><h3>Send the event you already have</h3><p>Use the native telemetry endpoint or the OpenTelemetry trace path. A collector can sit beside your existing runtime.</p></div><CodeBrackets size={21} /></div>
          <div className="step-row"><span className="step-number">02</span><div><h3>Shape the signal around your work</h3><p>Map sources, models, agents, tasks, and outcomes into the fields your team actually uses to reason.</p></div><ChartLine size={21} /></div>
          <div className="step-row"><span className="step-number">03</span><div><h3>Open the right window</h3><p>Keep the private operational view close; publish the aggregate profile that makes progress legible to the outside world.</p></div><ArrowUpRight size={21} /></div>
        </div>
      </section>

      <section className="shell content-section final-band"><Callout>UsageMax is a read surface for telemetry—not an identity system, and not a replacement for your existing access controls.</Callout><TextLink href="/security">See the security posture</TextLink></section>
    </div>
  );
}

const quickstart = `curl -X POST "$USAGEMAX_SITE_URL/api/v1/telemetry/llm" \
  -H "content-type: application/json" \
  -H "authorization: Bearer $USAGEMAX_COLLECTOR_TOKEN" \
  -H "x-usagemax-device-id: $USAGEMAX_INSTALLATION_ID" \
  -H "idempotency-key: batch_01J..." \
  -d '{
    "schemaVersion": 1,
    "events": [{
      "eventKey": "req_01J...",
      "eventType": "model_request",
      "source": "my-agent",
      "provider": "openai",
      "model": "gpt-5.6-sol",
      "inputTokens": 1280,
      "outputTokens": 412,
      "status": "ok",
      "occurredAt": "2026-09-13T12:00:00Z"
    }]
  }'`;

const traceExample = `{
  "resourceSpans": [{
    "resource": { "attributes": [{
      "key": "service.name",
      "value": { "stringValue": "my-agent" }
    }]},
    "scopeSpans": [{
      "spans": [{
        "name": "llm.generate",
        "attributes": [{
          "key": "gen_ai.request.model",
          "value": { "stringValue": "gpt-5" }
        }]
      }]
    }]
  }]
}`;

function CodeBlock({ label, children }: { label: string; children: string }) {
  return <div className="code-block"><div className="code-block-top"><span>{label}</span><span className="mono-muted">READ / COPY</span></div><pre><code>{children}</code></pre></div>;
}

export function DocsView() {
  return (
    <div className="page-surface content-page docs-page">
      <PageIntro
        description="A small, explicit surface for sending agent telemetry into a public profile. Keep the event contract boring; keep the resulting signal useful."
        eyebrow="Developer surface / 01"
        title={<>A clean path from <span className="text-accent">event</span> to insight.</>}
      >
        <Link className="button button-acid" href="#quickstart">Jump to quickstart <ArrowRight size={16} /></Link>
      </PageIntro>

      <div className="shell docs-layout">
        <aside className="docs-index">
          <div className="docs-index-label">On this page</div>
          <a href="#quickstart">01 / Quickstart</a>
          <a href="#event-contract">02 / Event contract</a>
          <a href="#open-telemetry">03 / OpenTelemetry</a>
          <a href="#public-surface">04 / Public surface</a>
          <div className="docs-index-card"><BookOpen size={18} /><strong>Need the why?</strong><Link href="/methodology">Read methodology <ArrowUpRight size={14} /></Link></div>
        </aside>

        <article className="docs-article">
          <section className="docs-section" id="quickstart"><div className="docs-section-kicker">01 / QUICKSTART</div><h2>Link a computer in one command.</h2><p>Sign in, create a private profile, and generate a short-lived command from your account. UsageMax uses ccusage to detect supported local coding agents, then uploads only aggregate counters in a bounded one-shot sync.</p><CodeBlock label="terminal / after generating a link code">bunx usagemax link UMX-XXXX-XXXX-XXXX-XXXX</CodeBlock><p>For custom runtimes, create an advanced collector key and send a bounded batch of model, tool, state, and outcome events:</p><CodeBlock label="terminal / native telemetry">{quickstart}</CodeBlock><Callout tone="cyan">Collector secrets are shown once and stored only as hashes. Never put provider credentials or prompt content in the event payload.</Callout></section>
          <section className="docs-section" id="event-contract"><div className="docs-section-kicker">02 / EVENT CONTRACT</div><h2>Small fields. Strong edges.</h2><p>Three required fields identify what happened; optional fields make the trace easier to follow. Token and cost fields are numeric so the public rollups stay deterministic.</p><div className="contract-table"><div><code>eventKey</code><span>stable, idempotent event identifier</span><b>required</b></div><div><code>model</code><span>the model actually used for the event</span><b>required</b></div><div><code>occurredAt</code><span>ISO timestamp or Unix milliseconds</span><b>required</b></div><div><code>eventType</code><span>model_request / tool_call / agent_state / outcome</span><b>optional</b></div><div><code>source</code><span>the runtime or product emitting the event</span><b>optional</b></div><div><code>costBasis</code><span>reported / estimated / unknown</span><b>optional</b></div><div><code>pricingVersion</code><span>calculator, rate card, or billing export version</span><b>optional</b></div><div><code>serviceTier / region</code><span>pricing modifiers retained without guessing</span><b>optional</b></div><div><code>projectId / costCenter</code><span>private allocation dimensions</span><b>optional</b></div><div><code>status</code><span>ok / error / cancelled</span><b>optional</b></div><div><code>traceId</code><span>optional link back to your private trace system</span><b>optional</b></div></div></section>
          <section className="docs-section" id="open-telemetry"><div className="docs-section-kicker">03 / OPEN TELEMETRY</div><h2>Bring the traces you already emit.</h2><p>If your runtime speaks OTLP, send trace payloads to the traces endpoint and let UsageMax map the recognized GenAI attributes into the same rollups.</p><CodeBlock label="json / OTLP trace excerpt">{traceExample}</CodeBlock><div className="inline-links"><TextLink href="/security">Review transport boundaries</TextLink><TextLink href="/methodology">See completeness rules</TextLink></div></section>
          <section className="docs-section" id="public-surface"><div className="docs-section-kicker">04 / PUBLIC SURFACE</div><h2>Read compact projections in realtime.</h2><p>The public UI is powered by bounded Convex projections: network totals, ranked profiles, daily rollups, and a short live window. The UI never queries raw tables.</p><div className="endpoint-list"><div><span className="endpoint-method">QUERY</span><code>public.network</code><small>global totals and current active agents</small></div><div><span className="endpoint-method">QUERY</span><code>public.leaderboard</code><small>period + metric + bounded limit</small></div><div><span className="endpoint-method">QUERY</span><code>public.profile</code><small>public identity, totals, and model mix</small></div><div><span className="endpoint-method">QUERY</span><code>public.daily / public.live</code><small>cadence and a moving event window</small></div><div><span className="endpoint-method">HTTP</span><code>?groupBy=model|source|device</code><small>daily breakdowns with privacy-safe device aliases</small></div></div></section>
        </article>
      </div>
    </div>
  );
}

export function SecurityView() {
  return (
    <div className="page-surface content-page security-page">
      <PageIntro
        description="UsageMax is designed to make AI work more legible without turning telemetry into a second source of sensitive content. The public surface is intentionally narrow."
        eyebrow="Trust / boundaries first"
        title={<>The signal is public. <span className="text-accent">The payload isn&apos;t.</span></>}
      >
        <Link className="button button-outline" href="/methodology">How data is shaped <ArrowUpRight size={16} /></Link>
      </PageIntro>

      <section className="shell security-principles content-section"><div className="security-lockup"><span className="security-lock-icon"><ShieldCheck size={32} /></span><span><strong>Public by selection</strong><small>Aggregated facts make the page. Private context stays at the edge.</small></span></div><div className="security-rule" /></section>
      <section className="shell content-section"><div className="detail-grid detail-grid-three"><DetailCard accent="acid" icon={<LockClosed size={21} />} index="01" title="No prompt content"><p>The public contract is about counts, models, states, costs, and timestamps. Prompt and completion bodies are not part of the public projection.</p></DetailCard><DetailCard accent="cyan" icon={<DatabaseIcon size={21} />} index="02" title="Bounded reads"><p>Every public query is limited by a fixed window or an explicit limit. The public UI reads compact projections rather than unbounded event history.</p></DetailCard><DetailCard accent="orange" icon={<ShieldCheck size={21} />} index="03" title="Scoped collector keys"><p>Each device receives a write-only, device-bound key. UsageMax stores only its hash and applies replay checks, payload caps, and per-device quotas.</p></DetailCard></div></section>
      <section className="shell content-section security-checklist"><div className="section-heading"><div className="eyebrow"><span className="eyebrow-line" />Operator checklist</div><h2>Keep the boundary <span className="text-accent">boring.</span></h2></div><div className="checklist"><div><span>✓</span><p><strong>Send metadata, not content.</strong><br />Use task labels and stable IDs; strip prompts and outputs before ingestion.</p></div><div><span>✓</span><p><strong>Use one collector per surface.</strong><br />Revoke or rotate at the edge when a runtime changes hands.</p></div><div><span>✓</span><p><strong>Publish only what you mean to publish.</strong><br />A public profile is a deliberate projection, not a raw trace viewer.</p></div></div></section>
      <section className="shell content-section final-band"><Callout tone="cyan">Security is a property of the data path and the data shape. UsageMax keeps both paths visible.</Callout><TextLink href="/docs">Read the ingestion docs</TextLink></section>
    </div>
  );
}

export function MethodologyView() {
  return (
    <div className="page-surface content-page methodology-page">
      <PageIntro
        description="A short field guide to what UsageMax counts, how it aggregates, and why a clean public metric needs explicit edges."
        eyebrow="Methodology / version 1"
        title={<>Measure the work you can <span className="text-accent">stand behind.</span></>}
      >
        <Link className="button button-acid" href="/docs">See the event contract <ArrowUpRight size={16} /></Link>
      </PageIntro>

      <section className="shell content-section methodology-intro"><div className="methodology-quote"><span>“</span><p>UsageMax is not trying to infer effort from a screenshot. It counts reported telemetry, makes the completeness visible, and keeps the projection bounded.</p></div><div className="methodology-facts"><div><span className="metric-label">Aggregation unit</span><strong>Profile × day × model</strong></div><div><span className="metric-label">Rank windows</span><strong>7d / 30d / all time</strong></div><div><span className="metric-label">Live window</span><strong>Latest 100 / profile</strong></div></div></section>

      <section className="shell content-section"><div className="section-heading"><div className="eyebrow"><span className="eyebrow-line" />The ledger</div><h2>Four facts keep the math <span className="text-accent">honest.</span></h2></div><div className="detail-grid detail-grid-four"><DetailCard icon={<ActivityIcon size={21} />} index="01" title="Reported"><p>Events are accepted with the token, cost, status, and timing values sent by the connected runtime.</p></DetailCard><DetailCard accent="cyan" icon={<ChartLine size={21} />} index="02" title="Rolled up"><p>Daily totals group activity by profile, date, source, and model so each view can stay compact.</p></DetailCard><DetailCard accent="orange" icon={<Sparkles size={21} />} index="03" title="Estimated"><p>When a provider returns partial accounting, completeness is retained rather than hidden behind false precision.</p></DetailCard><DetailCard icon={<ShieldCheck size={21} />} index="04" title="Bounded"><p>Rankings and live streams have explicit limits. A larger dataset does not silently become an unbounded read.</p></DetailCard></div></section>

      <section className="shell content-section methodology-table-section"><div className="section-heading"><div className="eyebrow"><span className="eyebrow-line" />Metric notes</div><h2>What each number <span className="text-accent">means.</span></h2></div><div className="methodology-table"><div className="methodology-table-head"><span>Metric</span><span>Definition</span><span>Surface</span></div><div><strong>Total tokens</strong><span>The source-reported total, or input plus output when no total is supplied. Cache and reasoning are shown only when the source exposes those dimensions; the remainder stays unclassified.</span><code>profile / daily</code></div><div><strong>Indexed spend</strong><span>Provider-reported spend or a labeled API-equivalent estimate. Missing prices remain unknown and are never presented as zero-cost usage.</span><code>network / profile</code></div><div><strong>Active agent</strong><span>A live agent row whose heartbeat has not passed its expiry window. Observability-only heartbeats do not alter accounting totals.</span><code>network / live</code></div><div><strong>Signal score</strong><span>The selected leaderboard metric for the chosen period, ordered descending.</span><code>leaderboard</code></div></div></section>
      <section className="shell content-section final-band"><Callout>The best public metric is one people can inspect, explain, and reproduce from the same event edge.</Callout><TextLink href="/leaderboard">Explore the signal board</TextLink></section>
    </div>
  );
}

function LegalView({ kind }: { kind: "privacy" | "terms" }) {
  const privacy = kind === "privacy";
  return (
    <div className="page-surface content-page legal-page">
      <PageIntro description={privacy ? "The short version of how UsageMax treats telemetry, profile data, and the public surface." : "The operating terms for using UsageMax public pages and sending telemetry to the service."} eyebrow={privacy ? "Legal / privacy" : "Legal / terms"} title={privacy ? <>Privacy, with the <span className="text-accent">lights on.</span></> : <>A clear contract for <span className="text-accent">public signal.</span></>} />
      <article className="shell legal-article">
        <div className="legal-meta"><span>Last updated</span><strong>September 13, 2026</strong><span className="meta-divider" /><span>Version 1.0</span></div>
        {privacy ? <>
          <LegalSection title="What UsageMax receives"><p>When a workspace connects a collector, UsageMax may receive event metadata such as model, provider, token counts, status, latency, task labels, agent identifiers, and timestamps. The public API is designed around those fields.</p><p>Do not send prompts, completions, secrets, access tokens, or other content you do not intend to process.</p></LegalSection>
          <LegalSection title="What becomes public"><p>A profile can expose aggregated totals, daily rollups, model mix, leaderboard entries, and a bounded live event view. Profiles are only returned by the public queries when marked public by the service.</p></LegalSection>
          <LegalSection title="Retention and deletion"><p>Retention depends on the workspace configuration and the service implementation. If you need a profile or collector removed, contact the UsageMax team with the handle or collector reference so the request can be scoped safely.</p></LegalSection>
          <LegalSection title="Changes"><p>We may update this page as the product changes. Material changes will be reflected by the date above.</p></LegalSection>
        </> : <>
          <LegalSection title="Use of the public service"><p>You may browse public profiles, rankings, documentation, and methodology pages for lawful purposes. Do not probe, overload, or attempt to bypass limits on the public surface.</p></LegalSection>
          <LegalSection title="Telemetry you send"><p>You are responsible for the event data sent from your workspace and for ensuring your collection path has the right permissions. Do not send secrets or content that should remain private.</p></LegalSection>
          <LegalSection title="Accuracy and availability"><p>UsageMax reports the telemetry it receives. It may be incomplete, delayed, estimated, or unavailable. A public metric is not a guarantee of performance, spend, outcome, or future availability.</p></LegalSection>
          <LegalSection title="Changes and contact"><p>These terms may evolve with the service. Questions about the boundary or a public profile can be sent to <a href="mailto:hello@usagemax.com">hello@usagemax.com</a>.</p></LegalSection>
        </>}
      </article>
    </div>
  );
}

function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="legal-section"><h2>{title}</h2>{children}</section>;
}

export function PrivacyView() {
  return <LegalView kind="privacy" />;
}

export function TermsView() {
  return <LegalView kind="terms" />;
}
