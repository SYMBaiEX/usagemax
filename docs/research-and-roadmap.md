# UsageMax research, architecture, and roadmap

_Decision record — September 13, 2026_

## Product thesis

TokenMaxxing proved that developers enjoy a public, competitive record of AI work.
UsageMax keeps that immediate appeal, then answers the enterprise question its
inspiration does not: **what did the spend produce, what was wasted, and what can
we safely change?**

The wedge is a privacy-first, verifiable AI work passport. The durable business is
an outcome and FinOps control plane for agent fleets.

## Clean-room reference audit

The reference audit used the MIT-licensed
[851-labs/tokenmaxxing repository](https://github.com/851-labs/tokenmaxxing) at
commit `3097e0e8f876865b08b66da6fc1800458f7fa37b` and the public
[TokenMaxxing product](https://tokenmaxxing.sh/). No source, copy, visual assets, or
component code were reused.

Observed reference capabilities:

- local CLI aggregation through `ccusage` for Amp, Claude Code, Codebuff, Codex,
  GitHub Copilot CLI, Factory Droid, Gemini CLI, Goose, Grok Build, Hermes, Kilo
  Code, Kimi CLI, OpenClaw, OpenCode, Pi, Qwen Code, and named Pi-format stores;
- device and source uploads, profiles, daily history, spend/token leaderboards,
  streaks, top model, heatmaps, and five-minute scheduled synchronization;
- public profile, leaderboard, stats, health, settings, and administration routes.

Important gaps found in the reference implementation:

- unrestricted date strings can contaminate totals with malformed future or epoch dates;
- privacy language emphasizes aggregation while normalized report JSON can be retained;
- device deletion does not clearly guarantee deletion of associated retained reports;
- CLI tokens do not expire;
- local-date and UTC boundaries can move daily totals;
- public documentation and source support can drift apart.

UsageMax addresses those in the foundation: strict time bounds, content-free
allowlists, hashed and revocable collectors, separate retention domains,
idempotent receipts, explicit provenance, and source-of-truth methodology pages.

## Competitive landscape

The product touches three markets:

- public usage identity: TokenMaxxing, UsageScope, and Usage Leaderboard;
- LLM observability: [Helicone](https://www.helicone.ai/),
  [Langfuse](https://langfuse.com/), [LangSmith](https://www.langchain.com/langsmith),
  [Braintrust](https://www.braintrust.dev/), [Portkey](https://portkey.ai/),
  [OpenLIT](https://openlit.io/), and [Phoenix](https://phoenix.arize.com/);
- AI FinOps and routing: [CloudZero](https://www.cloudzero.com/),
  [Vantage](https://www.vantage.sh/), [LiteLLM](https://www.litellm.ai/), and
  [OpenRouter](https://openrouter.ai/).

UsageMax should not become another generic trace viewer. Its differentiation is
verified cross-tool identity plus outcomes, retry waste, cache leverage, budget
policy, provider reconciliation, and safe routing recommendations.

## Realtime architecture

```text
Agent SDK / local collector
  -> native JSON or OTLP/HTTP JSON
  -> bounded Convex HTTP action
  -> auth + rate limit + batch/event idempotency
  -> recent normalized events
  -> daily/model/profile projections
  -> materialized leaderboard + agent live state
  -> Convex subscriptions
  -> UsageMax web and enterprise dashboards
```

Convex is the only MVP data layer. It owns tenant configuration, collector keys,
recent normalized events, outcomes, live agent presence, public profiles, rollups,
leaderboards, and subscriptions. This follows the documented capabilities of
[Convex HTTP actions](https://docs.convex.dev/functions/http-actions),
[database indexes](https://docs.convex.dev/database/reading-data/indexes/), and
[Next.js realtime integration](https://docs.convex.dev/client/nextjs/app-router/).

The hot path writes batches of no more than 100 compact events. The UI subscribes
to small projections, not the raw event lake. Only model requests affect accounting;
agent, tool, and outcome events remain a bounded observability stream. The separate
SYMBaiEX HUD reads local machine state and never publishes animation frames or
heartbeats to UsageMax.

The installed UsageMax client is a deliberate one-shot process, not a resident
daemon. It fingerprints metadata under the exact roots of all pinned local
adapters, exits without parsing logs or touching the network when nothing changed,
parses only the current day during normal sync, and reconciles the prior day once
at a UTC boundary. Full retained history is reconciled on first link, on collector
coverage changes, when a new source appears, on explicit `sync --full`, and at
most once per week. Each macOS, Windows, Linux, WSL, VM, or server home links as
its own stable installation and rolls up into the same account.

Convex documents and functions have explicit limits, including document size,
transaction bytes, scans, and writes; those constraints are treated as design
inputs rather than future cleanup. See [Convex limits](https://docs.convex.dev/production/state/limits).
At sustained high hundreds or thousands of events per second, an OpenTelemetry
Collector and analytical event store can sit in front while Convex remains the
realtime control and projection plane. That is a scale trigger, not an MVP dependency.

The telemetry vocabulary tracks current
[OpenTelemetry GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/),
but UsageMax versions its own contract because those conventions continue to evolve.

## Capability matrix

| Capability | MVP | Next | Enterprise |
|---|---:|---:|---:|
| Public profiles, streaks, heatmap, top models | Yes |  |  |
| Spend/token leaderboards: 7d, 30d, all | Yes |  |  |
| Native + OTLP JSON ingest | Yes |  |  |
| Authoritative collector snapshots and corrections | Yes |  |  |
| Opaque cross-source session accounting | Yes | Daily membership detail |  |
| Realtime active agents and parent/child topology | Yes |  |  |
| Idempotency, provenance, timestamp bounds, retention | Yes |  |  |
| Outcome ledger: accepted/rejected/abandoned/retried | Foundation | Full UI | Policy |
| WorkOS organization workspaces and server-enforced RBAC | Yes |  |  |
| Private paginated workspace audit trail | Yes | Audit export | Immutable archive |
| Projects, budgets, alerts |  | Yes | Yes |
| Retry waste, cache savings, cost per accepted outcome |  | Yes | Yes |
| Provider invoice reconciliation and anomaly detection |  |  | Yes |
| SSO/SAML and directory provisioning | AuthKit foundation | Customer onboarding | Yes |
| SCIM lifecycle webhook mirror and immutable audit export |  | Yes | Yes |
| Regional retention, BYOK, private networking |  |  | Yes |
| Routing recommendations and policy simulation |  | Experiment | Yes |

## Monetization

- Free: one public profile, local collector, leaderboards, 30-day recent telemetry.
- Pro ($39–59/month): private profile, budgets, outcomes, exports, longer rollups.
- Team ($249–399/month): workspaces, projects, policy, Slack/email digests, seats.
- Enterprise: SSO/SCIM, audit, regional retention, provider reconciliation,
  procurement controls, support, and volume pricing.

Public rankings are acquisition, not the primary enterprise revenue stream.
Enterprise value comes from measurable waste reduction and governance evidence.

## Roadmap

### 0–30 days — trustworthy parity

- ship UsageMax.com, public APIs, first-party profiles, and realtime leaderboards;
- publish the one-shot local collector and setup flow for all pinned ccusage
  adapters, plus an explicit coverage report for apps and direct API traffic that
  require OTel or provider exports;
- finish outcome capture and show cost per accepted outcome;
- verify GitHub/Google production callbacks, collector rotation, profile consent, export, and deletion recovery;
- load-test realistic 100, 500, and 1,000 event/second workloads.

### 30–90 days — team control plane

- team workspaces, projects, budgets, alerting, tags, and daily/weekly digests;
- retry-waste, cache-leverage, latency, error, quality, and model-mix views;
- signed collector releases and verifiable aggregate submissions;
- provider billing reconciliation against authoritative source/day snapshots;
- provider and application connectors for Cursor, Cline, Roo Code, Continue,
  Aider, Windsurf, direct SDK traffic, and billing exports.

### 90–180 days — enterprise moat

- customer SAML/OIDC and Directory Sync onboarding, lifecycle webhooks, immutable audit export, and retention controls;
- provider invoice reconciliation, chargeback/showback, anomaly detection;
- policy simulation and routing recommendations with savings confidence;
- collector gateway for protobuf, gzip, sampling, fan-in, and regional ingestion;
- security review, data-processing terms, compliance program, and enterprise SLAs.

## Success metrics

The north-star metric is **weekly accepted outcomes with verified cost**. Supporting
metrics are connected active collectors, verified usage coverage, cost per accepted
outcome, retry waste, cache savings, profile activation, team retention, and dollars
under governance. Raw token volume remains a fun public signal—not proof of value.
