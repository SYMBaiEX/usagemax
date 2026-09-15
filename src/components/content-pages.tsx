import Link from "next/link";
import type { ReactNode } from "react";

import { PageIntro, TextLink } from "./site-shell";
import { CopyButton } from "./copy-button";
import { TeamsShowcase } from "./teams-showcase";
import { CountingWorkbench } from "./counting-workbench";
import stories from "./product-stories.module.css";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CodeBrackets,
  DatabaseIcon,
  LockClosed,
  ShieldCheck,
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
        title="UsageMax for teams"
      >
        <Link className="button button-primary" href="/workspace">Start a free workspace <ArrowRight size={16} /></Link>
        <a className="button button-acid" href="mailto:hello@usagemax.com">Contact sales <ArrowUpRight size={16} /></a>
        <Link className="button button-quiet" href="/docs">Integration guide <ArrowRight size={16} /></Link>
      </PageIntro>


      <div className="shell">
        <TeamsShowcase variant="page" />
        <section className={stories.setup} aria-labelledby="team-setup-title">
          <div className={stories.sectionHeading}><h2 id="team-setup-title">Connect your team</h2><span>Three steps to connect</span></div>
          <div className={stories.setupFlow}>
            <article><div className={stories.stepVisual} aria-hidden="true"><CodeBrackets size={20} /><code>bunx usagemax</code><ArrowRight size={16} /><DatabaseIcon size={20} /></div><h3><small>01</small>Connect your sources</h3><p>Link each computer, or send model and tool events through the native API or OpenTelemetry endpoint.</p></article>
            <article><div className={stories.stepVisual} aria-hidden="true"><span>model</span><span>project</span><span>cost center</span></div><h3><small>02</small>Keep the context</h3><p>Attach source, model, agent, project, and cost-center fields to custom telemetry. Export data with its attribution intact.</p></article>
            <article><div className={stories.stepVisual} aria-hidden="true"><LockClosed size={20} /><span>Private workspace</span></div><h3><small>03</small>Set the boundaries</h3><p>Invite teammates with scoped roles. Company data stays private and separate from personal profiles.</p></article>
          </div>
        </section>
        <div className={stories.teamTrust}><p>Counts and context. No prompt content.<small>Hashed collector keys, replay protection, rate limits, and an audit trail for sensitive actions.</small></p><Link className={stories.storyLink} href="/docs">Read the integration guide <ArrowUpRight size={16} /></Link></div>
        <section className={stories.setup} aria-labelledby="plans-title"><div className={stories.sectionHeading}><h2 id="plans-title">Free for builders. More for companies.</h2><span>No card to start</span></div><div className={stories.setupFlow}>
          <article><h3>Personal · Free</h3><p>All retained history, public or private profiles, device linking, saved views, budgets and complete data exports. No paid tier required to keep your own data.</p></article>
          <article><h3>Small teams · Free</h3><p>Up to 10 members, 5 teams and 25 devices. Invitations, projects, roles, financial records and a private workspace.</p></article>
          <article><h3>Enterprise · By agreement</h3><p>Higher capacity, server-side provider connections, extended telemetry retention and WorkOS SSO/directory setup. Security, residency and support commitments are agreed and verified during onboarding.</p></article>
        </div></section>
      </div>
    </div>
  );
}

const quickstart = String.raw`curl -X POST "$USAGEMAX_SITE_URL/api/v1/telemetry/llm" \
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
  return <div className="code-block"><div className="code-block-top"><span>{label}</span><CopyButton value={children} /></div><pre tabIndex={0} aria-label={label}><code>{children}</code></pre></div>;
}

export function DocsView() {
  return (
    <div className="page-surface content-page docs-page">
      <PageIntro
        title="Documentation"
      >
        <Link className="button button-acid" href="#quickstart">Quickstart <ArrowRight size={16} /></Link>
      </PageIntro>

      <div className="shell docs-layout">
        <aside className="docs-index">
          <div className="docs-index-label">On this page</div>
          <a href="#quickstart">01 / Quickstart</a>
          <a href="#event-contract">02 / Event contract</a>
          <a href="#open-telemetry">03 / OpenTelemetry</a>
          <a href="#public-surface">04 / Public surface</a>
          <div className="docs-index-card"><BookOpen size={18} /><Link href="/methodology">Methodology <ArrowUpRight size={14} /></Link></div>
        </aside>

        <article className="docs-article">
          <section className="docs-section" id="quickstart"><h2>Quickstart</h2><p>Generate a link command in your account, then run it on each computer. UsageMax uses ccusage to detect supported agents and uploads aggregate counts in a one-shot sync.</p><CodeBlock label="terminal / after generating a link code">bunx usagemax link UMX-XXXX-XXXX-XXXX-XXXX</CodeBlock><p>For custom runtimes, create an advanced collector key and send a bounded batch of model, tool, state, and outcome events:</p><CodeBlock label="terminal / native telemetry">{quickstart}</CodeBlock><Callout tone="cyan">Collector secrets are shown once and stored only as hashes. Never put provider credentials or prompt content in the event payload.</Callout></section>
          <section className="docs-section" id="event-contract"><h2>Event contract</h2><p>Each event requires eventKey, model, and occurredAt. Token and cost fields must be numeric.</p><div className="contract-table"><div><code>eventKey</code><span>stable, idempotent event identifier</span><b>required</b></div><div><code>model</code><span>the model actually used for the event</span><b>required</b></div><div><code>occurredAt</code><span>ISO timestamp or Unix milliseconds</span><b>required</b></div><div><code>eventType</code><span>model_request / tool_call / agent_state / outcome</span><b>optional</b></div><div><code>source</code><span>the runtime or product emitting the event</span><b>optional</b></div><div><code>costBasis</code><span>reported / estimated / unknown</span><b>optional</b></div><div><code>pricingVersion</code><span>calculator, rate card, or billing export version</span><b>optional</b></div><div><code>serviceTier / region</code><span>pricing modifiers retained without guessing</span><b>optional</b></div><div><code>projectId / costCenter</code><span>private allocation dimensions</span><b>optional</b></div><div><code>status</code><span>ok / error / cancelled</span><b>optional</b></div><div><code>traceId</code><span>optional link back to your private trace system</span><b>optional</b></div></div></section>
          <section className="docs-section" id="open-telemetry"><h2>OpenTelemetry</h2><p>Send OTLP payloads to the traces endpoint. Recognized GenAI attributes map into usage rollups.</p><CodeBlock label="json / OTLP trace excerpt">{traceExample}</CodeBlock><div className="inline-links"><TextLink href="/security">Security</TextLink><TextLink href="/methodology">Coverage rules</TextLink></div></section>
          <section className="docs-section" id="public-surface"><h2>Public queries</h2><p>Bounded Convex queries expose aggregate public data, not raw event tables.</p><div className="endpoint-list"><div><span className="endpoint-method">QUERY</span><code>public.network</code><small>first-party network accounting totals</small></div><div><span className="endpoint-method">QUERY</span><code>public.leaderboard</code><small>period + metric + bounded limit</small></div><div><span className="endpoint-method">QUERY</span><code>public.profile</code><small>public identity, totals, and model mix</small></div><div><span className="endpoint-method">QUERY</span><code>public.daily / public.live</code><small>cadence and a moving event window</small></div><div><span className="endpoint-method">HTTP</span><code>?groupBy=model|source|device</code><small>daily breakdowns with privacy-safe device aliases</small></div></div></section>
        </article>
      </div>
    </div>
  );
}

export function SecurityView() {
  return (
    <div className="page-surface content-page security-page">
      <PageIntro
        title="Security"
      >
        <Link className="button button-outline" href="/methodology">Methodology <ArrowUpRight size={16} /></Link>
      </PageIntro>

      <section className="shell security-principles content-section"><div className="security-lockup"><span className="security-lock-icon"><ShieldCheck size={32} /></span><span><strong>Private by default</strong><small>Profiles appear publicly only when you publish them.</small></span></div><div className="security-rule" /></section>
      <section className="shell content-section"><div className="detail-grid detail-grid-three"><DetailCard accent="acid" icon={<LockClosed size={21} />} index="01" title="No prompt content"><p>The public contract is about counts, models, states, costs, and timestamps. Prompt and completion bodies are not part of the public projection.</p></DetailCard><DetailCard accent="cyan" icon={<DatabaseIcon size={21} />} index="02" title="Tenant-scoped reads"><p>WorkOS organization claims select one workspace per session. Server-side membership and permission checks run before private reads or writes; public UI reads only bounded projections.</p></DetailCard><DetailCard accent="orange" icon={<ShieldCheck size={21} />} index="03" title="Scoped collector keys"><p>Each device receives a write-only, device-bound key. UsageMax stores only its hash and applies replay checks, payload caps, per-device quotas, and auditable rotation.</p></DetailCard></div></section>
      <section className="shell content-section security-checklist"><div className="section-heading"><h2>Collector checklist</h2></div><div className="checklist"><div><span>✓</span><p><strong>Send metadata, not content.</strong><br />Use task labels and stable IDs; strip prompts and outputs before ingestion.</p></div><div><span>✓</span><p><strong>Use one collector per surface.</strong><br />Revoke or rotate at the edge when a runtime changes hands.</p></div><div><span>✓</span><p><strong>Review public visibility.</strong><br />Public profiles include aggregate usage and recent activity.</p></div></div></section>
      <section className="shell content-section final-band"><TextLink href="/docs">Ingestion documentation</TextLink></section>
    </div>
  );
}

export function MethodologyView() {
  return (
    <div className="page-surface content-page methodology-page">
      <PageIntro
        title="How we count"
      >
        <Link className="button button-acid" href="/docs">Event contract <ArrowUpRight size={16} /></Link>
      </PageIntro>

      <div className="shell">
        <CountingWorkbench />
        <dl className={stories.methodFacts}><div><dt><span>Aggregation</span></dt><dd><strong>Profile × day × model</strong></dd></div><div><dt><span>Ranking windows</span></dt><dd><strong>7d / 30d / all time</strong></dd></div><div><dt><span>Visibility</span></dt><dd><strong>Public profiles only</strong></dd></div></dl>
        <section aria-labelledby="counting-rules-title">
          <div className={stories.sectionHeading}><h2 id="counting-rules-title">The rules behind the numbers</h2></div>
          <div className={stories.principles}>
            <article><span>01</span><div><h3>A total, not a guess</h3><p>The source-reported total, or input plus output when no total is supplied. Cache and reasoning are shown only when the source exposes those dimensions; the remainder stays unclassified.</p></div></article>
            <article><span>02</span><div><h3>Same record, counted once</h3><p>Stable event keys protect against event replays. Re-running the collector reconciles stored snapshots instead of adding the same history again. Renaming a linked computer does not create new usage.</p></div></article>
            <article><span>03</span><div><h3>Activity is not accounting</h3><p>An active agent has a heartbeat within its expiry window. Observability-only heartbeats do not alter accounting totals.</p></div></article>
            <article><span>04</span><div><h3>Ranked within the window</h3><p>Public profiles are ordered by the selected metric—tokens or tracked cost—for 7 days, 30 days, or all time. Private workspace usage stays off the leaderboard.</p></div></article>
          </div>
        </section>
        <section className={stories.costGuide} aria-labelledby="cost-basis-title">
          <div className={stories.sectionHeading}><h2 id="cost-basis-title">Cost has a source, too.</h2><span>Tracked cost ≠ an invoice</span></div>
          <div className={stories.costGrid}>
            <article><b>Reported</b><p>Spend supplied by the provider or a billing export. Retained as reported, not recalculated from a generic rate.</p></article>
            <article><b>Estimated</b><p>A labeled API-equivalent calculation. Subscription allowances, discounts, and actual invoices can differ.</p></article>
            <article><b>Unknown</b><p>Missing prices remain unknown and are never presented as zero-cost usage. Combined totals can contain mixed cost bases.</p></article>
          </div>
        </section>
      </div>
      <section className="shell content-section final-band"><TextLink href="/leaderboard">Leaderboard</TextLink></section>
    </div>
  );
}

function LegalView({ kind }: { kind: "privacy" | "terms" }) {
  const privacy = kind === "privacy";
  return (
    <div className="page-surface content-page legal-page">
      <PageIntro title={privacy ? "Privacy policy" : "Terms of service"} />
      <div className="shell legal-layout"><aside className="legal-index"><nav aria-label="Trust and legal"><Link href="/privacy" aria-current={privacy ? "page" : undefined}>Privacy policy</Link><Link href="/terms" aria-current={!privacy ? "page" : undefined}>Terms of service</Link><Link href="/security">Security overview</Link></nav><a href="mailto:hello@usagemax.com">Contact <ArrowUpRight size={13} /></a></aside><article className="legal-article">
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
      </article></div>
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
