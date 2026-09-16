const markdown = `---
title: UsageMax terms
description: Terms for browsing public UsageMax data and documentation.
canonical: https://usagemax.com/terms
last-updated: 2026-09-16
---

# UsageMax terms

You may browse public profiles, rankings, documentation, and methodology pages lawfully. Do not probe, overload, or bypass limits. Telemetry may be incomplete, delayed, estimated, or unavailable.

See the [terms of service](/terms).
`;
export function GET() { return new Response(markdown, { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=3600, stale-while-revalidate=86400", vary: "Accept" } }); }
