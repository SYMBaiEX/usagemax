---
name: enterprise-reporting
description: Use UsageMax public contracts and documented workspace boundaries to design enterprise AI-usage reporting without exposing prompts or secrets.
---

# UsageMax enterprise reporting

Use this skill when planning organization-wide AI spend visibility, team
comparisons, model mix, data retention, or an integration with UsageMax.

## Design rules

- Keep organization data tenant-scoped and private by default.
- Separate public profile projections from enterprise workspace reporting.
- Attribute model requests to a provider, model, source, device, and time range.
- Preserve a cost-basis label (`reported`, `estimated`, `api-equivalent`, or
  `mixed`) instead of presenting an estimate as an invoice.
- Make writes idempotent and auditable; never use a client-side total as the
  accounting authority.
- Keep prompts, completions, source code, paths, credentials, and raw tool
  arguments out of the UsageMax contract.

## Available public contract

Read the OpenAPI document at `https://usagemax.com/openapi.json` before building
an integration. Public data is bounded. Collector ingestion is authenticated,
installation-bound, rate-limited, and content-free. The public MCP surface is
read-only and does not expose private workspace data or ingestion mutations.

For SSO, SCIM, retention policy, audit export, regional residency, or private
team dashboards, treat the enterprise product and its signed agreement as the
source of truth. Do not claim that a control exists merely because WorkOS can
support it in principle.
