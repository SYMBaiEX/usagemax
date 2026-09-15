# Enterprise interface and production configuration

## Interface

- Applied a shared compact spacing and type scale to the homepage, rankings,
  public profiles, documentation, enterprise, security, methodology, legal, and
  account controls. Preserved the warm neutral palette and orange accent.
- Reduced profile hero height to 320px on desktop, leaderboard rows to 54px,
  section headings to 26–32px, and desktop controls to 36px. Mobile actions keep
  44px targets. Tables retain horizontal rules rather than cell grids.
- Replaced the homepage's relative-profile bar with a labeled cost summary and
  removed the enterprise decorative waveform. No new polling or animation loops.
- Removed obsolete animation rules, folded style updates into the existing
  selectors, and normalized the stylesheet with the installed CSS compiler.

## Production configuration and data

- WorkOS production permissions configured: `workspace:manage`, `profile:manage`,
  `collectors:manage`, `data:export`, `audit:read`. Added to Admin; Member remains
  unchanged. Per-customer role authorization tests remain an onboarding gate.
- User-created WorkOS endpoint targets `/api/webhooks/workos`, subscribes to the
  five organization/membership lifecycle events, and has its signing secret stored
  in production Convex. Forged signatures return HTTP 401. A correctly signed,
  intentionally ignored event returns HTTP 200 without mutating tenant data.
- Restored six additional approved snapshot rows. Full reconciliation completed:
  229 partitions, 4,163 session identifiers, eight local sources; sync healthy.
  Production tokens and cost remained exactly 96,282,408,710 and 73,046,009,121
  micros. Adoption changed no token totals.
- Fixed a CLI date-marker bug: daily aggregates used noon UTC, causing today's
  rows to be rejected before noon. They now use UTC midnight. Added a regression
  test. This source fix needs a new npm release through the trusted publishing
  workflow; the existing public 0.3.0 package is unchanged.

## Evidence and open gates

- Local checks: 39 backend tests, 21 CLI tests, lint, typecheck, production build.
- Browser: nine public routes at 1280px and 390px, with no document overflow.
- Convex team dashboard warns that the free plan limits are exceeded. Capacity
  and billing decisions remain with the owner; no paid plan was selected.
- GitHub Actions runners remain blocked by the account's Actions budget. Do not
  confuse passing local checks with completed CodeQL or trusted npm publishing.
- No screen application changes were made.
