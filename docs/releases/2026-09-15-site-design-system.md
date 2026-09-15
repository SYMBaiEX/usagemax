# Site-wide paper-and-ink redesign

## Scope

Extended the landing page's editorial design across the leaderboard, public profiles, account workspace, enterprise, documentation, methodology, security, privacy, terms, and route error states. The shared navigation and footer now use the same layout and palette as the landing page.

## Changes

- Replaced the accumulated global stylesheet with a smaller, organized design system: warm paper, dark ink, restrained orange, compact controls, and readable data layouts.
- Added active navigation, an accessible mobile menu with Escape handling, profile section links, and account/documentation/legal sidebars.
- Refined the landing page and added working clipboard buttons with success and failure feedback to installation examples.
- Reworked profile charts and statistics into a light personal usage record; retained the existing data queries and metric calculations.
- Preserved account permission guards and destructive-action confirmations. Removed automatic focus that scrolled the page into the computer-link form.
- Account expiry updates now run only while a link code awaits redemption, rather than on every idle account page.
- Added branded not-found and recoverable error states without exposing internal error details.

No collector, telemetry ingestion, backend authorization, pricing, or physical-display code changed.

## Verification before release

- `bun run lint`, `bun run typecheck`, and `bun run build` passed.
- `bun run test`: 56 web/backend tests and 21 CLI tests passed (77 total).
- Added server-rendered regression coverage for page headings, documentation anchors and clipboard controls, active navigation, owner/read-only account permissions, and loading/signed-out states.
- Browser checked all public page layouts at desktop and mobile widths, including real public profile data. No document-level horizontal overflow at 1280px or 390px. Additional landing/profile checks passed at 320px and 768px.
- Verified clipboard success feedback and mobile menu Escape/focus behavior.
- Authenticated production account inspection and exact deployment verification follow publication; tests above do not claim to exercise production mutations.
