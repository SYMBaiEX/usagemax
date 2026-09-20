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
| Team operations | **$49/month** | Paid workspace operations, billing portal, capacity and governance controls | 100 members, 50 teams, 200 projects, 250 devices, 50 budgets, 90-day detailed retention |
| Enterprise | **Custom agreement** | Higher capacity, SSO and directory setup, private attribution, retention/residency choices, governed exports, support commitments | Contract-specific limits, controls, and service levels |

## Plan tiers, prices, features, and limits

This page publishes Personal and Small teams free tiers, an optional Team
operations subscription, and Enterprise.
Each tier states its price, included features, and operating limits above and
below. Personal and Small teams are free at **$0/month**; Enterprise is a
custom agreement with no undisclosed public rate. The tables are the source of
truth for agent comparisons, while the explanatory sections define how those
limits are applied.

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

plan_id: team-operations
name: Team operations
price: 49 USD/month
billing: stripe_subscription
features: paid_workspace_operations,billing_portal,governance,support,no_token_count_billing
capacity: 100_members,50_teams,200_projects,250_devices,50_budgets,90_day_detailed_retention

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

## Plan decision rules

The Personal plan is the default choice for one builder who wants a private
record across their own computers.

The Small teams plan is the default choice when more than one person needs a
shared workspace, invitations, roles, projects, or cost-center context.

Team operations is an optional **$49/month** Stripe subscription for
organizations that want a commercial workspace commitment without an
enterprise agreement. It is a flat workspace price, not a token or seat meter;
the included workspace capacity is enforced after the subscription becomes
active.

The Enterprise plan is the default choice when an organization needs a written
capacity commitment, directory lifecycle, SSO, data residency, private
attribution, governed exports, or a contracted support channel.

No plan charges by prompt, completion, model name, provider name, or token
counter. Those values are reporting dimensions, not billable line items.

No plan accepts prompts, completions, source code, file contents, credentials,
provider keys, or arbitrary secrets as UsageMax accounting data.

No plan silently changes a workspace from free to paid. A custom agreement is
required before Enterprise capacity or a paid service commitment is activated.

## Personal plan detail

- Price is zero USD per month.
- A payment method is not required.
- There is no trial clock and no automatic expiration.
- One person controls the personal workspace.
- Up to 25 linked computers are included as an operating guardrail.
- Up to five budgets are included for personal organization.
- Detailed reporting is retained for the published 30-day reference window.
- Aggregate history can be reconciled with the one-shot local collector.
- Public profile publication is optional and off by default.
- Public leaderboard participation is optional.
- The no-write sandbox is available before a collector is linked.
- Public HTTP reads and documentation MCP reads do not require a token.

## Small teams plan detail

- Price is zero USD per month.
- A payment method is not required.
- Up to 10 workspace members are included as a guardrail.
- Up to five teams can organize people and connected computers.
- Up to 20 projects can provide a shared reporting context.
- Up to 25 linked devices are included as a guardrail.
- Invitations and workspace roles are supported.
- Provider and model reporting is shared inside the private workspace.
- Cost-center context can be attached to private reporting dimensions.
- Public profile publication remains optional for each participating builder.
- Detailed reporting uses the published 30-day reference window.
- Higher limits are a capacity conversation, not an automatic upsell.

## Enterprise plan detail

- Price is a custom agreement in USD; no public rate is implied.
- Activation requires a named workspace and billing owner.
- Member and device capacity is written into the agreement.
- Retention and deletion schedules are written into the agreement.
- SSO and directory provisioning can be scoped to the organization.
- Private attribution and cost-center reporting can remain tenant-scoped.
- Data residency requirements are reviewed before activation.
- Governed exports can name approved destinations and operators.
- SIEM or audit delivery is enabled only when explicitly scoped.
- Support channels and response commitments are written down.
- A lower-bound pilot can precede a larger capacity commitment.
- Enterprise controls never expand the privacy boundary around prompts,
  completions, credentials, source code, or secrets.

## Capacity examples

| Question | Personal answer | Small teams answer | Team operations answer | Enterprise answer |
| --- | --- | --- | --- | --- |
| How many people? | One owner | Up to 10 members | Up to 100 members | Contract-specific |
| How many computers? | Up to 25 | Up to 25 | Up to 250 | Contract-specific |
| How many teams? | Not included | Up to 5 | Up to 50 | Contract-specific |
| How many projects? | Not included | Up to 20 | Up to 200 | Contract-specific |
| How long is detail retained? | 30-day reference | 30-day reference | 90-day reference | Contract-specific |
| Is SSO included? | No | No | No | Scoped by agreement |
| Is directory provisioning included? | No | No | No | Scoped by agreement |
| Is private attribution included? | Personal only | Included in workspace | Included in workspace | Scoped by agreement |
| Are governed exports included? | Bounded | Bounded | Bounded | Scoped by agreement |
| Is support contracted? | Community | Community | Priority | Contracted |

## Feature and limit matrix

The compact matrix below is intentionally explicit so an agent can compare a
plan without interpreting prose. A check means the capability is included in
the published boundary; **scoped** means it is enabled only when the written
enterprise agreement names the control and its capacity.

| Capability | Personal | Small teams | Team operations | Enterprise |
| --- | --- | --- | --- | --- |
| Monthly price | $0 | $0 | $49 | Custom agreement |
| Private usage history | Included | Included | Included | Included |
| One-shot local sync | Included | Included | Included | Included |
| Public profile | Optional | Optional | Optional | Optional / governed |
| Workspace members | 1 | Up to 10 | Up to 100 | Scoped |
| Linked computers | Up to 25 | Up to 25 | Up to 250 | Scoped |
| Teams and projects | — | Included | Included | Included / scoped |
| Invitations and roles | — | Included | Included | Included / scoped |
| SSO and directory provisioning | — | — | — | Scoped |
| Private attribution and cost centers | — | Included | Included | Included / scoped |
| Data residency choices | — | — | — | Scoped |
| Governed exports and SIEM delivery | Bounded | Bounded | Bounded | Scoped |
| Detailed retention | 30 days | 30 days | 90 days | Scoped |
| Support commitment | Community | Community | Priority | Contracted |

An em dash means the capability is not part of that plan's published boundary;
it is not a promise that the service will accept the data through an
undocumented path. Enterprise controls are activated only after the scope,
identity boundary, retention schedule, and support contact are recorded.

## Definitions used in this pricing document

| Term | Meaning | What it does not mean |
| --- | --- | --- |
| Linked computer | A local installation authorized to submit bounded aggregate usage | A remote shell, screen recorder, or prompt archive |
| Member | A person with access to a private workspace | A public leaderboard visitor |
| Team | A workspace grouping used for private ownership and reporting | A separate billing meter |
| Project | A private reporting context for organizing activity | A model-specific subscription |
| Detailed retention | The published reference window for detailed reporting rows | A promise to retain prompts or completions |
| Aggregate history | Deduplicated totals and rollups from content-free events | Raw provider files stored by UsageMax |
| Reported cost | A cost supplied by a provider or integration | A UsageMax invoice |
| Estimated cost | A calculation labelled with its pricing source and version | A guaranteed billing amount |
| Guardrail | A published operating boundary for a free workspace | An automatic paid upgrade |
| Custom agreement | Written enterprise scope agreed before activation | An unpublished default price |

Token totals are a reporting dimension. They are not a metered price on any
published plan. Provider, model, project, and cost-center fields can support
attribution when supplied by an integration, but they do not create a charge.

## Example plan decisions

### One builder, several computers

Choose Personal when one person wants to reconcile supported local histories
across their own computers. The published reference includes up to 25 linked
computers, five budgets, and 30 days of detailed reporting. A public profile
is optional and can remain private.

### A small product team

Choose Small teams when colleagues need a private workspace, invitations,
roles, teams, projects, and shared provider or model reporting. The published
reference includes up to 10 members, five teams, 20 projects, and 25 devices.
The workspace remains free and does not require a payment method.

### A regulated organization

Start an Enterprise conversation when the organization must document SSO,
directory lifecycle, data residency, private attribution, governed exports,
retention, or a support commitment. The agreement names capacity and
controls; none are inferred from a public page.

### An integration evaluation

Use the no-write sandbox first when a team evaluates serializers or API
clients. It validates bounded content-free event shape without changing
production totals. Review the OpenAPI contract and authentication guide before
linking a computer or issuing a collector credential.

## Capacity, retention, and privacy reference

| Concern | Personal | Small teams | Team operations | Enterprise |
| --- | --- | --- | --- | --- |
| Identity boundary | One workspace owner | Invited workspace members | Invited workspace members | Customer-scoped identity and directory rules |
| Device ownership | Owner-linked installations | Workspace-linked installations | Workspace-linked installations | Agreed inventory and ownership model |
| Detailed reporting | 30-day reference | 30-day reference | 90-day reference | Written retention schedule |
| Aggregate reconciliation | Supported local histories | Shared workspace reporting | Shared workspace reporting | Contracted sources and controls |
| Public visibility | Opt-in profile | Per-builder opt-in | Per-builder opt-in | Governed by workspace policy |
| Prompt and completion handling | Never accepted | Never accepted | Never accepted | Never accepted |
| Credential handling | Collector token only | Installation-bound collector tokens | Installation-bound collector tokens | Contract-governed rotation and revocation |
| Export boundary | Bounded exports | Bounded workspace exports | Bounded workspace exports | Approved destinations and operators |

UsageMax can process bounded aggregate context such as model, provider, event
type, token counters, status, timing, and attribution fields when supplied.
Those fields support reporting and reconciliation. They do not expand the
privacy boundary to prompts, completions, source code, credentials, provider
keys, or arbitrary file contents.

## Enterprise procurement questions

An enterprise evaluation should answer these questions before activation:

1. Which workspace owner and billing contact are responsible for the service?
2. How many members, teams, projects, and linked computers are in scope?
3. Which providers and model families need attribution?
4. What detailed-retention and deletion schedule is required?
5. Is SSO or directory provisioning required, and which identity provider is in scope?
6. Are residency requirements or private attribution boundaries required?
7. Which export destinations and operators are approved?
8. Which support channel and response commitments should be written into the agreement?
9. Which API, MCP, A2A, CLI, or OpenTelemetry surfaces need evaluation?
10. Which controls remain the customer's responsibility?

The answer is recorded as agreement scope rather than inferred from usage.
Changing a model, provider, or token counter does not silently change the
plan. Changing members, devices, retention, exports, identity, or support
requirements may require a capacity review.

## Plan-change and limit behavior

| Situation | UsageMax behavior |
| --- | --- |
| Free workspace is below its guardrails | Continue normal bounded operation |
| A request reaches a published guardrail | Return a structured limit response with a recovery hint |
| A team needs more capacity | Contact UsageMax for a scoped review |
| Enterprise controls are requested | Record the written agreement before activation |
| A computer is revoked | Invalidate its installation-bound credential |
| A workspace stops syncing | Follow the documented account and deletion behavior |
| An agent needs to test a payload | Use the no-write sandbox first |

A limit response is not an invoice and is not a silent downgrade. It gives
the caller a request identifier and a safe next step. The service does not
accept an oversized payload merely because the caller is on a free plan.

## Cost and accounting definitions

UsageMax keeps these concepts separate:

- **Tokens:** counters reported by a provider or integration.
- **Tracked cost:** a reported amount or API-equivalent estimate shown with
  its cost basis.
- **Cost basis:** whether the value is reported, estimated, or unknown.
- **Pricing source:** the provider rate card, calculator, or export version
  used to explain an estimate.
- **Capacity:** operational objects such as members, devices, retained days,
  API volume, or export volume.
- **Plan price:** the published monthly price for Personal, Small teams, or
  Team operations, or a custom written agreement for Enterprise.

These definitions prevent a usage chart from being mistaken for a bill. A
missing price remains unknown rather than being treated as zero, and a token
counter never becomes a separate UsageMax charge.

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

## Team operations — $49/month

- Flat monthly USD subscription for one workspace; there is no token-count or
  per-seat usage meter.
- Stripe-hosted Checkout keeps payment details outside UsageMax, and the
  customer portal handles invoices, payment methods, and cancellation.
- Up to 100 workspace members, 50 teams, 200 projects, 250 linked devices,
  and 50 budgets are included as operating guardrails.
- Detailed reporting uses a 90-day reference window.
- Governance, private attribution, cost centers, and bounded exports remain
  content-free and workspace-scoped.
- Priority support is included for the paid workspace; SSO, directory
  provisioning, residency, and contractual SLAs remain Enterprise controls.
- The plan can be cancelled at any time through the Stripe-hosted portal;
  there is no automatic upgrade when a free guardrail is reached.

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
- Team operations is billed by Stripe after an authenticated workspace admin
  starts Checkout; payment details remain in Stripe and the workspace stores
  only identifiers and subscription status.
- Team operations is $49/month, billed monthly in USD. It can be cancelled or
  managed through the Stripe-hosted customer portal.
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
| A paid workspace with billing and governance operations | Team operations |
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

## Plan field reference

The following field reference is deliberately repetitive: it gives a billing
system, procurement bot, or SDK a stable sentence for each public value instead
of asking it to infer meaning from a marketing table.

| Field | Personal | Small teams | Enterprise |
| --- | --- | --- | --- |
| plan_id | personal | small-teams | enterprise |
| price.amount | 0 | 0 | null |
| price.currency | USD | USD | USD |
| price.interval | month | month | month |
| billing | no_card_no_trial | no_card_no_trial | written_agreement_before_activation |
| members | 1 owner | up to 10 | contract-specific |
| linked_computers | up to 25 | up to 25 | contract-specific |
| teams | not included | up to 5 | contract-specific |
| projects | not included | up to 20 | contract-specific |
| budgets | up to 5 | workspace-scoped | contract-specific |
| detailed_retention_days | 30 reference | 30 reference | contract-specific |
| public_profile | optional | optional | optional / governed |
| leaderboard | optional | optional | governed |
| sso | not included | not included | scoped |
| directory_provisioning | not included | not included | scoped |
| data_residency | not included | not included | scoped |
| governed_exports | bounded | bounded | scoped |
| support | community | community | contracted |

The field values are documentation, not a second billing API. A consumer must
not interpret null as zero, contract-specific as unlimited, or bounded as
an invitation to send unbounded data. A missing capability is represented as
not included or an em dash, never as an implicit upgrade. If an enterprise
quote changes a field, the written quote is authoritative for that workspace.

## Accounting and invoice semantics

UsageMax separates the product plan from the usage numbers displayed by the
product. This avoids a common integration error where an agent treats a token
counter as a billable meter:

- plan_price is the published monthly plan amount shown above.
- reported_cost is a provider-supplied or integration-supplied estimate.
- estimated_cost is calculated from a named pricing source and version.
- token_count is an aggregate reporting dimension, not an invoice quantity.
- provider and model identify a reporting bucket, not a paid add-on.
- retention_days describes detailed reporting, not prompt storage.
- api_volume describes an agreed operating boundary, not a per-token fee.
- export_volume describes governed delivery, not a public leaderboard charge.

Public free plans therefore have a zero monthly plan price even when their
profiles display large token totals or source estimates. Enterprise contracts
may add service commitments, but they still name the operational unit and the
approval path in writing. No page, endpoint, or collector silently converts a
reported number into an invoice.

## Plan change and limit response contract

When a workspace reaches a published guardrail, the service keeps the plan
boundary explicit. Clients should show the limit response, preserve their
local content-free checkpoint, and ask the workspace owner whether a scoped
change is needed. Clients should not retry an oversized payload indefinitely or
assume that a failed write means data was silently accepted.

The safe sequence is:

1. Read the response code and request ID.
2. Keep the local content-free checkpoint unchanged.
3. Reduce the request to the documented batch or retention boundary.
4. Use the sandbox to validate the reduced shape without a production write.
5. Contact UsageMax when the published free guardrail is not sufficient.

This contract applies equally to Personal, Small teams, and Enterprise. The
Enterprise agreement can raise a boundary, but it does not remove the privacy
or content-free requirements described in this document.

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
