const markdown = `---
title: About UsageMax
description: UsageMax makes AI work measurable without collecting prompt content.
canonical: https://usagemax.com/about
last-updated: 2026-09-16
---

# About UsageMax

UsageMax is an open-source usage observability platform for people and teams building with AI. It brings together local coding-agent histories, native model events, OpenTelemetry traces, provider context, and enterprise workspace reporting into a bounded view of usage.

The public side makes aggregate work comparable; the private side gives a workspace owner controls for cost, cadence, models, projects, and connected computers. Counts, model names, status, timing, and carefully selected attribution fields can explain usage. Prompts, completions, source code, credentials, and private workspace data do not belong in the public projection.

The website and API are separate from the optional screen/HUD project. A local collector performs a short-lived, one-shot reconciliation and sends idempotent aggregates or content-free telemetry over HTTPS. Convex provides the realtime projection layer. WorkOS AuthKit handles website sign-in and organization membership; it is not a general API OAuth token.

Public reads are bounded, collector credentials are installation-bound and write-only, and private workspaces are tenant-scoped. Capacity, retention, residency, and support commitments for enterprise customers are agreed explicitly rather than implied by the public product.

Read the [security model](https://usagemax.com/security), [counting rules](https://usagemax.com/methodology), and [documentation](https://usagemax.com/docs) before connecting a source.
`;

const headers = { "cache-control": "public, max-age=3600, stale-while-revalidate=86400", "content-type": "text/markdown; charset=utf-8", vary: "Accept" };

export function GET() { return new Response(markdown, { headers }); }
export function HEAD() { return new Response(null, { headers }); }
