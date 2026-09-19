const markdown = `---
title: UsageMax pricing
description: Free personal usage observability and custom enterprise capacity.
canonical: https://usagemax.com/pricing
last-updated: 2026-09-19
---

# UsageMax pricing

UsageMax keeps the core usage record free for individual builders and small
teams. The published prices below are intentionally simple; capacity guardrails
protect the shared service, while enterprise capacity is scoped to the
customer's data, identity, and operating requirements. There is no surprise
meter, trial expiration, or required payment method on the free plans.

| Plan | Price | Included | Published capacity guardrails |
| --- | --- | --- | --- |
| Personal | **$0/month** | Private history, one-shot syncs, supported local histories, optional public profile, bounded exports | Up to 25 linked computers, 5 budgets, 30-day detailed retention |
| Small teams | **$0/month** | Private workspace, invitations, roles, teams, projects, shared provider/model reporting, cost-center context | Up to 10 members, 5 teams, 20 projects, 25 devices, 30-day detailed retention |
| Enterprise | **Custom agreement** | Higher capacity, SSO and directory setup, private attribution, retention/residency choices, governed exports, support commitments | Contract-specific limits, controls, and service levels |

## Machine-readable plan summary

The following records repeat the public plan boundary in a compact form for
agents and procurement systems. The price field is a monthly USD amount only
when a fixed public amount exists; custom_agreement means UsageMax does not
publish a rate and does not activate the plan without a written agreement.

\`\`\`text
plan_id: personal
name: Personal
price: 0 USD/month
billing: no_card_no_trial
features: private_history,one_shot_syncs,optional_public_profile,bounded_exports
capacity: 25_linked_computers,5_budgets,30_day_detailed_retention

plan_id: small-teams
name: Small teams
price: 0 USD/month
billing: no_card_no_trial
features: private_workspace,invitations,roles,teams,projects,shared_reporting
capacity: 10_members,5_teams,20_projects,25_devices,30_day_detailed_retention

plan_id: enterprise
name: Enterprise
price: custom_agreement
billing: written_agreement_before_activation
features: higher_capacity,sso,directory_setup,private_attribution,residency_choices,governed_exports,support_commitments
capacity: contract_specific
\`\`\`

These identifiers are descriptive documentation, not an API or a promise of
automatic upgrades. The free plan records are available without a payment
method; the enterprise record is a scoped commercial conversation.

## Personal — $0/month

- No credit card and no trial clock.
- Link supported computers and reconcile retained local provider histories with
  the lightweight usagemax CLI.
- Keep history private by default; publish a public profile only when you opt in.
- Use native content-free telemetry, OpenTelemetry/HTTP JSON integrations, and
  the no-write [sandbox](https://usagemax.com/sandbox) before connecting a key.

## Small teams — $0/month

- Create a private workspace and invite members with scoped roles.
- Organize connected computers with teams, projects, and cost centers.
- Compare providers, models, cadence, tracked cost, and coverage without
  moving prompts or completions into the public projection.
- The limits in the table are service-capacity guardrails, not a paid upgrade
  prompt. Contact the team when a real organization needs more.

## Enterprise — custom agreement

Enterprise plans are designed around member and device volume, telemetry
retention, private attribution, SSO and directory needs, data residency,
governed exports, support, and agreed service levels. We do not publish a
one-size-fits-all rate card or imply that a feature is certified before the
customer-specific configuration and evidence are complete.

For a scoped evaluation, [contact UsageMax](https://usagemax.com/contact) with
the number of people and computers, providers, retention expectations, identity
requirements, and any private cost-center or SIEM requirements.

## What counts toward capacity

Capacity is measured using bounded operational objects rather than prompt
content: linked computers, workspace members, projects, reported events,
retention windows, and export or API volume. A model name, provider name, or
token counter is not sold as a separate line item. UsageMax rejects prompts,
completions, source code, credentials, and arbitrary unbounded payloads at the
collector boundary.

## Billing and plan changes

- Personal and Small teams are **$0/month** and do not require a card.
- Enterprise pricing is agreed before activation; UsageMax does not silently
  move a free workspace onto a paid plan.
- An enterprise evaluation can use the no-write [sandbox](https://usagemax.com/sandbox)
  and the public [OpenAPI contract](https://usagemax.com/openapi.json) without
  creating production records.
- A workspace can remain on its current plan while you contact the team about
  capacity, retention, identity, residency, or support requirements.

## Included interfaces

Every plan can use the public profile and leaderboard, the documented HTTP
reads, and the lightweight bunx usagemax collector for supported local
histories. Enterprise workspaces can scope private attribution, retention,
identity, export, and service-level requirements in a written agreement. The
same privacy boundary applies to the website, CLI, HTTP API, MCP, A2A, and
OpenTelemetry integrations.

## Plan selection at a glance

| Need | Recommended plan |
| --- | --- |
| Personal history across a few computers | Personal |
| A small private workspace with invitations and projects | Small teams |
| SSO, directory setup, private attribution, residency, governed exports, or contracted support | Enterprise |

See the [documentation](https://usagemax.com/docs) for setup, the
[security model](https://usagemax.com/security) for data boundaries, and
[contact UsageMax](https://usagemax.com/contact) when the published guardrails
do not fit your organization.

## Operational guardrails

| Boundary | Personal and Small teams | Enterprise |
| --- | --- | --- |
| Public reads | Bounded and cacheable | Bounded, with agreed capacity |
| Collector writes | Installation-bound, content-free | Installation-bound, governed by contract |
| Sandbox | Available without a token | Available for evaluation and integration tests |
| Prompts and completions | Never accepted or published | Never accepted or published |
| Credentials and source code | Never accepted or published | Never accepted or published |

The sandbox validates event shape, size, and field boundaries without writing
production totals. It is the recommended first request for an agent or SDK.
The public API, MCP, A2A, WebMCP, and CLI all expose the same read-only and
content-free boundaries; an interface does not bypass a plan guardrail.

## Questions agents and finance teams ask

**Is there a free plan?** Yes. Personal and Small teams are free, with no card
and no trial clock.

**Can I test before signing in?** Yes. The no-write sandbox accepts a bounded
content-free event and returns writes: false.

**Do token counts become an invoice?** No. Tracked cost is a reported or
API-equivalent estimate and is labelled with its pricing basis.

**Can a workspace be upgraded without approval?** No. Enterprise capacity is
activated through a written custom agreement; free workspaces are not silently
converted to paid plans.

**What happens when a guardrail is reached?** The service returns a structured
limit response and the workspace can contact UsageMax for a scoped review. It
does not ingest unbounded data or silently drop an accounting boundary.

## Same privacy boundary on every plan

UsageMax may process bounded aggregate usage context such as model, provider,
source, counters, status, timing, and dates. Prompts, completions, source code
and credentials are never part of the public projection; access tokens and
private workspace data are not part of the
public projection. See the [security model](https://usagemax.com/security) and
[methodology](https://usagemax.com/methodology) for the evidence behind the
numbers.

## Capacity reference

The following reference points make plan conversations concrete without turning
aggregate telemetry into a per-token invoice:

| Measure | Free workspace reference | Enterprise conversation |
| --- | --- | --- |
| Connected computers | Personal and Small teams guardrails above | Agreed device inventory and ownership model |
| Workspace members | Small teams invitation limit above | Directory groups, delegated administration, and lifecycle rules |
| Detailed history | 30-day detailed retention reference | Agreed retention and deletion schedule |
| Public projection | Opt-in profile and bounded leaderboard rows | Private attribution and tenant-scoped views |
| Export and API volume | Bounded public reads and collector batches | Contracted quotas, audit exports, and support windows |

These are operating boundaries, not a promise that a free workspace will be
expanded automatically. UsageMax reports a structured limit response when a
request exceeds a published boundary. The response includes a request ID and a
safe recovery hint; it does not accept an oversized payload or silently turn a
free workspace into a paid one.

## Enterprise evaluation checklist

Before an enterprise agreement is activated, the UsageMax team confirms the
workspace owner, member and device count, providers in scope, retention period,
data residency needs, identity provider, export destinations, and support
contacts. A customer can validate serializers against the no-write sandbox and
review the OpenAPI, MCP, A2A, and CLI contracts before any production link is
created.

The agreement records which controls are enabled and which remain customer
responsibilities. SSO, directory provisioning, residency, private attribution,
SIEM delivery, and contracted service levels are not implied by the free plans
or by a public documentation page. They are enabled only after the written
scope and operational evidence are complete.

## What a quote includes

An enterprise quote names the workspace, billing owner, included members and
devices, retention window, supported ingestion sources, export destinations,
support channel, and renewal or review date. It also identifies whether the
workspace is private, whether profiles can be published, and which roles can
invite members or rotate collector credentials.

UsageMax does not charge separately for a model name, provider name, token
counter, or public leaderboard row. If a contract includes an allowance, the
allowance is stated in operational terms such as devices, members, retained
days, API requests, or export volume. A customer can ask for a lower-bound
pilot before committing to a larger capacity tier.

## Changes, cancellation, and deletion

Free workspaces can stop syncing at any time and can revoke linked computers
from the account surface. A new link creates a new installation-bound token;
revoking a device invalidates its old credential. Enterprise agreements define
their own notice, renewal, retention, export, and deletion schedule. UsageMax
does not retain a secret merely because a workspace changes plans.

For a pricing question, send the smallest useful context to
[hello@usagemax.com](mailto:hello@usagemax.com): approximate members, devices,
providers, retention, residency, and export needs. Never include a collector
token, provider credential, prompt, completion, source code, or private event
payload in a pricing request.
`;

const headers = {
  "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
  "content-type": "text/markdown; charset=utf-8",
  vary: "Accept, User-Agent",
};

export function GET() {
  return new Response(markdown, { headers });
}

export function HEAD() {
  return new Response(null, { headers });
}
