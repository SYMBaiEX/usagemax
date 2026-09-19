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
