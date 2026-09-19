const markdown = `---
title: UsageMax WebMCP
description: Register bounded UsageMax tools for browser-based AI agents.
canonical: https://usagemax.com/webmcp
last-updated: 2026-09-16
---

# UsageMax WebMCP

UsageMax exposes four bounded, read-only in-page tools when the browser
provides the WebMCP API. The current standards path is
\`document.modelContext.registerTool()\`; the older
\`navigator.modelContext\` preview is only a compatibility fallback.

## Tools

- \`usagemax_network_stats\` — read bounded public network totals
- \`usagemax_leaderboard\` — read a public ranking for a bounded window
- \`usagemax_public_profile\` — read one opt-in public profile by handle
- \`usagemax_ask\` — ask a bounded question about public documentation

All four tools are read-only and return public projections. They do not accept
collector credentials, prompts, completions, source code, or private workspace
data.

## Registration

The page registers tools imperatively with an AbortSignal so navigation or
component teardown removes the registrations:

    const controller = new AbortController();
    await document.modelContext.registerTool({
      name: "usagemax_network_stats",
      title: "Read network statistics",
      description: "Read bounded public UsageMax network statistics.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: true,
        consequentialHint: false
      },
      execute: async (_input, { signal }) => {
        const response = await fetch("https://usagemax.com/api/stats", {
          credentials: "omit",
          signal
        });
        return response.json();
      }
    }, { signal: controller.signal });

    // Abort when the owning page or component is disposed.
    controller.abort();

The browser may reject registration when WebMCP is unavailable, disabled by
permissions policy, or not enabled for the current origin trial. UsageMax
keeps the normal page functional in all of those cases.

See the [live HTML guide](https://usagemax.com/webmcp), [agent capability index](https://usagemax.com/?mode=agent), and [WebMCP draft](https://webmachinelearning.github.io/webmcp/) for the surrounding contract.
`;

const headers = {
  "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
  "content-type": "text/markdown; charset=utf-8",
  vary: "Accept",
};

export function GET() {
  return new Response(markdown, { headers });
}

export function HEAD() {
  return new Response(null, { headers });
}
