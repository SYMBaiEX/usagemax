# UsageMax enterprise readiness

_Control record — updated September 15, 2026_

New workspace features are implemented and locally verified on
`codex/usagemax-readiness`, **not yet released to production**. See
[the delivery record](enterprise-delivery-plan.md) for acceptance and remaining
engineering gates. Production WorkOS role changes require explicit approval.

This document separates implemented product controls from customer-specific
onboarding and operational evidence. “Implemented” does not mean certified.

## Implemented controls

- WorkOS AuthKit authentication with GitHub and Google sign-in.
- Organization-scoped workspaces selected from signed `org_id` session claims.
- Server-enforced role and permission checks for workspace, profile, collector,
  export, deletion, and audit operations.
- Explicit WorkOS permission claims are authoritative; role defaults are used only
  when a permission claim is absent from the token.
- Personal and organization workspaces are isolated for a user with both contexts.
- Organization memberships are mirrored on authenticated access and deactivated
  memberships cannot resolve a workspace.
- Private, tenant-scoped, paginated append-only audit events for profile, visibility, collector,
  workspace export, and deletion lifecycle actions.
- Hashed, write-scoped collector credentials with one-time display, rotation,
  individual and workspace-wide emergency revocation, device binding, replay
  protection, payload bounds, and layered rate limits.
- Signed, idempotent WorkOS organization and membership lifecycle webhook
  processing with replay and out-of-order event protection.
- Authoritative source/day/model snapshots with correction receipts and resumable,
  bounded account deletion.
- Bounded public projections and indexed date-range reads rather than per-day query
  fan-out.
- CSP, HSTS, frame denial, MIME sniffing protection, restricted browser permissions,
  request IDs, non-cacheable API errors, and a `security.txt` disclosure route.
- Frozen dependency installs, automated tests, dependency updates, extended CodeQL
  scanning, npm provenance, and a documented release/recovery runbook.

## Customer onboarding gates

These controls require customer- or environment-specific configuration before an
enterprise contract can claim them:

1. Configure the UsageMax permission slugs in WorkOS and assign least-privilege
   roles. Test one denied and one permitted operation per role in production.
2. Configure the customer’s SAML/OIDC connection and verified organization domains.
3. Enable WorkOS Directory Provisioning for customers that require SCIM lifecycle
   management. Add and verify a signed webhook endpoint before claiming automatic
   deprovisioning in UsageMax.
4. Choose retention, region, export, and support requirements in the order form and
   DPA. The current product is not certified for a particular compliance framework.
5. Complete backup restore, deletion, credential compromise, and tenant-isolation
   exercises and retain dated evidence.

## Remaining engineering gates

- Immutable audit export to customer-owned object storage or SIEM.
- Projects, cost centers, budgets, notifications and a separated financial ledger
  are implemented in the pending release. Statistical anomaly policies, invoice
  line matching, accounting close and verified source identity remain open.
- Live provider contract tests with authorized customer credentials, broader
  provider coverage and independently verified-versus-self-reported trust tiers.
- Production load evidence at agreed event rates, SLOs, alert thresholds, and
  documented capacity triggers.
- Independent application security review and dependency/code scanning evidence.
- Regional data residency, customer-managed keys, and private network ingestion
  where contractually required.

## Go-to-market language

UsageMax has an enterprise-oriented identity, authorization, ingestion, audit,
and data-boundary foundation. Do not claim SSO, SCIM lifecycle,
compliance certification, immutable audit storage, regional residency, or a tested
SLA for a customer until the corresponding onboarding or evidence gate is closed.
