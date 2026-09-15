# Landing page rebuild — September 15, 2026

Replaces the repeated marketing/profile-card layout with an editorial introduction,
a paper usage record, one interactive public ledger, concise setup instructions,
and an enterprise entry point. Profiles, account, authentication, ingestion, and
the hardware screen are unchanged.

The receipt reads actual first-party network totals. The ledger requests at most
five public profiles and supports token/cost ordering and all-time/30-day/7-day
windows. Estimates remain explicitly distinguished from invoices. Missing data
never becomes a fabricated metric or profile.

The page has its own CSS module and no new dependencies. It no longer imports the
profile/chart component bundle. Two Convex subscriptions replace three; no polling,
timers, animation library, WebGL, or external artwork is added. Entrance animations
run once and honor reduced-motion preferences.

Validation: lint, TypeScript, 44 web/backend tests and 21 CLI tests pass. Five new
landing tests cover real totals, loading, empty data, multiple/long names, and
missing configuration. Browser checks cover 320, 390, 768, 1024, 1280, and 1440px,
ranking controls, and profile navigation. No document overflow was observed.
