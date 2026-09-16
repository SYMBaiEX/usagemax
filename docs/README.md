# UsageMax documentation

This directory is the repository documentation index. Product behavior and
machine-readable contracts remain authoritative in the application routes and
OpenAPI document; these pages explain how to use, integrate, operate, and
contribute to UsageMax.

## Start here

- [Root README](../README.md) — product overview and the shortest path to a
  first sync.
- [CLI guide](../packages/cli/README.md) — install, link, sync, diagnostics,
  scheduling, and recovery.
- [Telemetry contract](telemetry-contract.md) — native events, snapshots,
  OpenTelemetry, limits, and privacy rules.
- [Authentication guide](https://usagemax.com/auth.md) — the credentials and
  authentication boundaries that exist today.
- [Methodology](https://usagemax.com/methodology) — counting, completeness,
  pricing, and public ranking rules.

## Product and integration reference

- [Architecture](ARCHITECTURE.md) — runtime shape, data flow, and trust
  boundaries.
- [Automatic sync](automatic-sync.md) — optional scheduling behavior.
- [Visual system](visual-system.md) — interface tokens and motion guidance.
- [Agent skills](../skills/README.md) — installable agent-facing skills.

The public agent and protocol surfaces are listed in the root README and
maintained by their route contracts: [OpenAPI](https://usagemax.com/openapi.json),
[MCP](https://usagemax.com/mcp), [documentation MCP](https://usagemax.com/docs-mcp),
[A2A](https://usagemax.com/a2a), [WebMCP](https://usagemax.com/webmcp), and
[llms.txt](https://usagemax.com/llms.txt).

## Contributors and operators

- [Contributing](../CONTRIBUTING.md) — local development and contribution
  boundaries.
- [Release checklist](RELEASE.md) — source, verification, artifact, and
  rollback gates. It does not authorize publication by itself.
- [Operations runbook](operations-runbook.md) — service boundaries, incident
  handling, recovery, and account deletion.
- [Enterprise readiness](enterprise-readiness.md) — implemented controls and
  customer-specific gates; it is not a compliance certification.
- [Enterprise delivery record](enterprise-delivery-plan.md) — internal
  acceptance history and remaining engineering work.
- [Readiness remediation](readiness-remediation.md) — dated internal evidence
  and open release gates.

## Historical records

Files under [releases/](releases/) and the dated top-level release record
preserve release evidence. They are not current product promises. Check the
current route, CLI, and OpenAPI contract before relying on a dated statement.

Standalone research, parity audits, roadmap drafts, visual review notes, and
security review reports are intentionally not kept here. Current requirements
from those records are summarized in the canonical product contracts and the
operator/release records above.

## Documentation rules

Keep public product guidance task-oriented and factual. Do not document secrets,
private identifiers, unsupported providers, unverified capacity, pricing, SSO,
compliance, or deployment behavior as if they were guaranteed. When a claim is
customer- or environment-specific, record it as an explicit gate in the
operator documentation instead.
