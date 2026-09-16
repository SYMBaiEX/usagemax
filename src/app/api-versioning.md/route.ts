const markdown = `---
title: UsageMax API versioning and deprecation policy
description: Compatibility and retirement signals for UsageMax API clients.
canonical: https://usagemax.com/api-versioning.md
last-updated: 2026-09-16
---

# UsageMax API versioning and deprecation policy

UsageMax uses URL versioning for collector contracts and keeps the public read surface backwards compatible within a major API version.

## Current versions

- <code>/api/v1</code> contains device linking, native telemetry, and OpenTelemetry ingestion.
- <code>/api/v2</code> contains the authoritative usage snapshot protocol.
- <code>/api/stats</code>, <code>/api/leaderboard</code>, and <code>/api/profiles</code> are the current public read routes.

Documented public and collector API responses include <code>X-API-Version: 1</code>. The [OpenAPI contract](https://usagemax.com/openapi.json) is canonical for request and response shapes.

## Compatibility

Additive response fields and optional request fields may be introduced without changing the major URL. Required fields, authentication requirements, privacy boundaries, and accounting semantics do not change silently. New collector contracts use a new versioned path and are documented in the CLI before becoming recommended.

## Deprecation

When a route is retired, UsageMax returns HTTP 410 or a documented compatibility response with <code>Deprecation: true</code>, a UTC <code>Sunset</code> timestamp, and a <code>Link</code> header pointing to the replacement documentation. The retired screen endpoint at <code>/api/v1/screen/{handle}</code> is the reference example.

Clients should treat unknown fields as forward-compatible, fail safely on unknown error codes, and read <code>Retry-After</code> for rate-limit responses. Do not infer that a 202 response means an unbounded background job; ingestion responses are receipts for the bounded write flow described by OpenAPI.
`;

const headers = { "cache-control": "public, max-age=3600, stale-while-revalidate=86400", "content-type": "text/markdown; charset=utf-8", vary: "Accept" };

export function GET() { return new Response(markdown, { headers }); }
export function HEAD() { return new Response(null, { headers }); }
