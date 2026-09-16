const markdown = `---
title: UsageMax pricing
description: Free personal usage observability and custom enterprise capacity.
canonical: https://usagemax.com/pricing
last-updated: 2026-09-16
---

# UsageMax pricing

UsageMax keeps the core usage record free for individual builders and small
teams. The published prices below are intentionally simple; capacity guardrails
protect the shared service, while enterprise capacity is scoped to the
customer's data, identity, and operating requirements.

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
