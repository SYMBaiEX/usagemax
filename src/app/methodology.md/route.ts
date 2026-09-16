const markdown = `---
title: How UsageMax counts
description: UsageMax aggregation, ranking, and completeness methodology.
canonical: https://usagemax.com/methodology
last-updated: 2026-09-16
---

# How UsageMax counts

Usage is aggregated by profile, day, and model. Stable event keys prevent replayed history from being counted twice. Public rankings cover 7-day, 30-day, and all-time windows and include public profiles only.

Activity heartbeats do not change accounting totals. Missing prices remain unknown rather than being treated as zero.

See the [methodology page](/methodology).
`;
export function GET() { return new Response(markdown, { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=3600, stale-while-revalidate=86400", vary: "Accept" } }); }
