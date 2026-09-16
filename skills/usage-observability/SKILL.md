---
name: usage-observability
description: Use UsageMax to read public AI-usage projections, compare profiles, inspect model mix, and explain the content-free collector contract.
---

# UsageMax usage observability

Use this skill when a user asks for public token totals, tracked-cost estimates,
model or source mix, leaderboard comparisons, or the boundaries of the UsageMax
collector.

## Read-only public data

Prefer the bounded public HTTP API or the public MCP server:

- Network totals: `https://usagemax.com/api/stats`
- Leaderboard: `https://usagemax.com/api/leaderboard?metric=tokens&window=all`
- Profile: `https://usagemax.com/api/profiles/{handle}`
- Natural-language public resources: `https://usagemax.com/ask`
- Typed contract: `https://usagemax.com/openapi.json`
- MCP: `https://usagemax.com/mcp`

Treat missing public data as missing. Do not infer private usage, subscription
bills, or a complete history from a partial projection.

## Local linking

Use the published package for a local, one-shot sync:

```bash
bunx usagemax@latest link UMX-XXXX-XXXX-XXXX-XXXX
```

The collector sends aggregate counters, model/provider names, costs, dates,
source names, coverage state, and opaque session identities. It must not be
given prompts, completions, source code, file contents, project paths, tool
arguments, provider credentials, or access tokens in event payloads.

Automatic scheduling is opt-in and runs the same short-lived sync. It is not a
resident watcher or live event stream. Use `usagemax doctor --deep` to audit
retained source coverage before interpreting totals.

## Authentication boundary

Public reads require no credential. Collector writes use a one-use link code,
an installation-bound write-only bearer token, `x-usagemax-device-id`, JSON, and
idempotency keys. Website sign-in is a separate WorkOS session. Never put a
collector token in a URL, prompt, event body, or public profile.
