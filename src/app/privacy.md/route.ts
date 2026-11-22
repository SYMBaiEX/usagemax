const markdown = `---
title: UsageMax privacy
description: Telemetry and public-profile privacy boundaries.
canonical: https://usagemax.com/privacy
last-updated: 2026-11-21
---

# UsageMax privacy

UsageMax may receive telemetry metadata such as model, provider, token counts, status, latency, task labels, agent identifiers, and timestamps. Do not send prompts, completions, secrets, or access tokens.

Eligible CLI runs can send a separate daily activity signal with a rotating pseudonym and version and platform information. Disable it with \`usagemax telemetry disable\`, \`USAGEMAX_TELEMETRY_DISABLED=1\`, or \`DO_NOT_TRACK=1\`. See the [CLI product telemetry guide](https://docs.usagemax.com/cli-analytics).

Public profiles expose aggregate data only when published by the service. See the [privacy policy](/privacy).
`;
export function GET() { return new Response(markdown, { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=3600, stale-while-revalidate=86400", vary: "Accept" } }); }
