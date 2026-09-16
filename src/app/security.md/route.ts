const markdown = `---
title: UsageMax security
description: UsageMax public data, collector, and bounded-read security boundary.
canonical: https://usagemax.com/security
last-updated: 2026-09-16
---

# UsageMax security

The public contract contains counts, models, states, costs, and timestamps—not prompt or completion bodies. Public reads are bounded projections; collector credentials are write-scoped, hashed, device-bound, replay-protected, and rate-limited.

See the [security page](/security) and [privacy policy](/privacy).
`;
export function GET() { return new Response(markdown, { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=3600, stale-while-revalidate=86400", vary: "Accept" } }); }
