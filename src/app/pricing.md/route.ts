const markdown = `---
title: UsageMax pricing
description: Free personal usage observability and custom enterprise capacity.
canonical: https://usagemax.com/pricing
last-updated: 2026-09-16
---

# UsageMax pricing

UsageMax keeps the core usage record free for individual builders and small teams. Enterprise capacity is scoped to the customer's data, identity, and operating requirements instead of being represented by an invented public rate card.

## Personal — free

- One account with linked computers and supported local provider histories.
- One-shot syncs, private history, optional public profile, and bounded exports.
- Native content-free telemetry and OpenTelemetry/HTTP JSON integrations.
- No card required.

## Small teams — free

- Private workspace membership, invitations, roles, projects, and cost-center context.
- Shared reports across connected computers and providers.
- The same content boundary: prompts, completions, source code, credentials, and secrets are not part of the UsageMax public projection.

## Enterprise — by agreement

Enterprise plans are designed around member and device volume, telemetry retention, private attribution, SSO and directory needs, data residency, exports, support, and agreed service levels. Contact [hello@usagemax.com](mailto:hello@usagemax.com) for a scoped evaluation.

The [enterprise page](https://usagemax.com/enterprise) describes the operating surface. The [security page](https://usagemax.com/security) and [methodology](https://usagemax.com/methodology) explain the boundaries behind every plan.
`;

const headers = {
  "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
  "content-type": "text/markdown; charset=utf-8",
  vary: "Accept, User-Agent",
};

export function GET() {
  return new Response(markdown, { headers });
}

export function HEAD() {
  return new Response(null, { headers });
}
