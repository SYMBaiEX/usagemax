# Free personal + enterprise delivery

_Internal delivery record; dated acceptance notes are not product promises._

Use [docs/README.md](README.md) for the current documentation map and
[enterprise-readiness.md](enterprise-readiness.md) for the distinction between
implemented controls and customer-specific gates.

Requested September 15, 2026. Keep Convex and WorkOS. Preserve both visual themes,
existing public profiles, the low-overhead collector, and the separate screen project.

## Product contract

- Personal tracking, historical summaries, private/public profiles, source coverage,
  device management, exports, and personal reporting remain free. No payment card.
- Small collaborative workspaces are free with published abuse/capacity limits.
- Paid enterprise adds company-wide administration, provider connectors, financial
  allocation/reconciliation, governance, automation, and contractual support.
- No client-selected paid entitlement. Enterprise activation is an operator action
  following a commercial agreement; do not charge users or fabricate billing setup.
- No prompts/source code by default. No automatic publication of company data or
  transfer of personal history into a company. No implied completeness or measured
  savings without supporting evidence.

## Requirements and acceptance

| ID | Requirement | Acceptance | State |
| --- | --- | --- | --- |
| R1 | Organizations and invitations | Create/switch, invite/resend/revoke/reconcile, accept, membership/owner safeguards | Implemented; mocked orchestration tested; production roles approved, applied and verified; live invitation exercise remains |
| R2 | Teams, projects, identities | Scoped management, membership history, own-device enrollment and offboarding | Implemented; tenant/ownership tests pass; richer identity attribution remains below |
| R3 | Free personal quality of life | Private dashboard, dates/model/source filtering, timezone/default range, saved views, streaming exports, budgets | Implemented; >500-row export and privacy tests pass; production checks pending |
| R4 | Financial ledger | Separate estimated/reported/billed, currencies, idempotency, allocation, monthly reconciliation | Implemented; monetary regression tests pass; not an invoice-close system |
| R5 | Provider connections | Encrypted credentials, shared bounded imports, coverage/error states and disconnect | Implemented for three documented capabilities; vault activation and real-provider tests pending |
| R6 | Budgets and savings | Deduplicated in-app alerts, evidence-backed savings workflow and measurements | Implemented/tested; automated anomalies and independent approval controls remain below |
| R7 | Agent economics | Private paginated parent/agent/model/tool/outcome observations | Implemented on existing metadata; no invented joins or totals; unit economics remains below |
| R8 | Governance | Entitlement boundary, workspace retention, audit export, offboarding, deletion cleanup | Implemented/tested; customer configuration and procurement evidence gates remain |
| R9 | Product surfaces | Real data bindings, both themes, responsive forms/tables, free/enterprise copy | Implemented; synthetic rendered checks at 1280px and 390px; live auth pending |
| R10 | Verification and release | Regression/security tests, lint/types/build, scoped push and live verification | Local checks and production backend deployment pass; website rollout evidence tracked in PR #8; GitHub CI/security jobs blocked by Actions budget |

## Customer-specific gates

SSO/SCIM connections require customer identity-provider configuration and a verified
deprovisioning exercise. Provider imports require authorized customer credentials.
SOC 2/ISO certification, independent penetration testing, customer-managed keys,
contracted residency, legal terms and SLA commitments require their own evidence;
shipping controls or documentation must not be represented as certification.

## Architecture

One WorkOS organization identifies a company security boundary. Convex owns
application teams/projects, effective-dated attribution, preferences and financial
records. Provider observations and invoices are separate from collector token totals:
imports must not double count existing personal or company usage. All new reads are
tenant-scoped and bounded/paginated; all writes derive the actor from verified auth.
Provider polling is shared per connection, never per browser tab or computer.

## Current baseline

Clean checkout on `codex/usagemax-readiness` at start. Existing organization membership,
collector credentials, lifecycle receipts, coverage and telemetry/outcome tables are
foundations, not proof of the above workflows. No production data changes at planning.

## Verification record

- 131 Vitest tests and 21 CLI tests pass (152 total), including idempotent WorkOS
  orchestration with a mocked SDK, tenant isolation, personal/company switching,
  financial corrections, budget/coverage alert deduplication, retention, deletion,
  paginated import checkpoints, disconnect races and complete ledger export.
- ESLint and TypeScript pass. Production Next build passes, including `/workspace`
  and `/api/workspace/export`. CLI packaging dry-run passes with a task-local npm
  cache; the user's existing npm cache was not modified or permission-repaired.
- Light/dark desktop and 390px mobile fixtures have no document overflow. Fixtures
  use synthetic data and no live actions; no fixture route or auth bypass ships.
- No local collector loop, new daemon, npm publish, screen code or SSH changes.
  Provider synchronization runs on Convex, independent of browser/device count.
- Convex auth guidance drove server-side tenant/permission checks. The GPT Engineer
  acceptance-tracking workflow keeps implemented controls distinct from release
  and customer verification. Generic frontend-design skills were not used.
- The initial WorkOS permission and backend-deployment safety holds were respected.
  On September 15 the owner explicitly approved the exact role mapping, then the
  separate production deployment and merge plan. All seven roles were applied and
  verified through fresh WorkOS reads; unrelated widget permissions were preserved
  and no memberships were reassigned.
- Production Convex `rapid-rhinoceros-943` now runs backend commit `e77e2df` from
  PR #8. Schema validation and strict backend TypeScript checking passed; deployment
  added indexes and deleted none. The dedicated `convex/tsconfig.json` uses the
  installed Convex template settings and the installed Node type definitions.
- After deployment, `/api/health` and `/api/stats` returned HTTP 200 with the
  unchanged 96,282,408,710-token total. Protected workspace, personal-summary and
  connection reads returned structured `AUTH_REQUIRED` errors without a session.
  This verifies the public/read boundary, not a complete signed-in customer journey.
- Website merge/deployment evidence is tracked in
  [PR #8](https://github.com/SYMBaiEX/usagemax/pull/8). GitHub CI, CodeQL and Copilot
  review jobs did not start because of the Actions budget; local checks are not
  substitutes for completed hosted security scanning. No checks were disabled.
- Convex reported that the account exceeds Free-plan limits. Billing was not
  changed. Resolve capacity/billing before promising availability or scale.
- The provider vault remains unconfigured and real customer-provider tests remain
  outstanding. No npm package was published in this release.

## Approved and applied WorkOS mapping

Apply only to the existing UsageMax production WorkOS environment. Existing unrelated
widget permissions are preserved. No customer memberships are reassigned by the
configuration script. Existing members gain self-device enrollment; existing admins
gain the additional team/finance/integration administration permissions below.

| Role | UsageMax permissions |
| --- | --- |
| owner | All 12 permissions in `convex/account.ts:WORKSPACE_PERMISSIONS` |
| admin | All except `workspace:delete`; owner-only member safeguards still apply |
| finance | `finance:read`, `finance:manage`, `data:export` |
| manager | `teams:manage` for assigned teams, `collectors:self` |
| member | `collectors:self` (their own devices only) |
| auditor | `audit:read`, `finance:read`, `data:export` |
| viewer | Membership-level workspace metadata, no privileged operations |

The approved mapping was applied with `scripts/configure-enterprise.ts --apply` and
the existing WorkOS API key injected through an operator environment, never
command-line text or logs. Fresh sessions and allowed/denied operation exercises
for each customer role remain onboarding requirements. The script defaults to
read-only mode and preserves unrelated permissions; future expansions require
their own authorization.

## Provider implementation boundaries

- Anthropic Console: daily reported USD cost from `/v1/organizations/cost_report`.
  Decimal cents convert to integer micros. No Claude subscription/Bedrock/priority
  invoice completeness claim. [API reference](https://platform.claude.com/docs/en/api/beta/organization/cost_report/retrieve).
- Cursor: chargeable usage from paginated filtered usage events, using
  `chargedCents` including Cursor fees. Included-plan notional usage is not treated
  as extra cash spend. Each 500-event page checkpoints; only a completed day is
  committed to the ledger. A changing report fails closed for reconciliation.
  [Admin API](https://cursor.com/docs/account/teams/admin-api).
- GitHub: current Copilot seat count only; not token counts, per-person adoption
  or billed costs. [Seat API](https://docs.github.com/en/rest/copilot/copilot-user-management#list-all-copilot-seat-assignments-for-an-organization).
- API credentials use AES-256-GCM with workspace/provider/account-bound additional
  authenticated data. Configure a 32-byte hex `PROVIDER_ENCRYPTION_KEY` in Convex
  before enabling connections. Never overwrite an existing key without migration;
  this version does not implement customer-managed KMS keys or rotation migration.
- One Anthropic and one Cursor account per workspace until upstream account identity
  is independently verified, to prevent accidental duplicate financial imports.
- Imports never write collector token totals. Credentials are never returned by
  public queries. Disconnect erases the stored credential and invalidates leases.
- These connectors have contract/fixture validation, not real customer API evidence.

## Remaining engineering roadmap (not claimed shipped)

1. Vault setup, real login/invite/SSO/offboarding exercises, completed hosted
   CI/security scanning, and ongoing live-path verification. Role configuration
   and the production backend rollout are complete. Resolve the GitHub Actions
   budget and Convex account capacity warning; do not disable checks or silently
   change billing.
2. Full provider identity reconciliation, multi-account connections, OpenAI admin
   costs, Claude Enterprise Analytics, Copilot per-person usage and billing, cloud
   provider imports, contract pricing/credits, invoice line matching and accounting
   close. Current monthly comparisons do not establish complete cost coverage.
3. Organization ownership transfer, directory group-to-team policies, bulk invites,
   efficient large-team search, governed exports and independent approver roles.
4. Statistical spend anomalies, forecasts, alert routing to Slack/email/webhooks,
   policy automation and explicit provider enforcement where supported. Current
   budgets notify in-app; they do not block spending.
5. Measured agent/task unit economics, outcome attribution, team leaderboards using
   agreed fairness/privacy policies, effective-dated allocation and outcome joins.
   Current agent observations and financial ledger are intentionally not guessed
   together. Potential savings are not verified savings.
6. Customer SIEM/WORM export, KMS key rotation, residency options, backup/restore and
   load/soak evidence, security review and commercial support/SLA runbooks. Capacity
   limits in product policy are guardrails, not proof of supported concurrency.
