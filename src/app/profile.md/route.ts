import { fetchQuery } from "convex/nextjs";

import { api } from "../../../convex/_generated/api";

export const dynamic = "force-dynamic";

const origin = "https://usagemax.com";

function normalizeHandle(handle: string) {
  return handle.replace(/^@/, "").toLowerCase();
}

function markdownText(value: unknown) {
  return String(value ?? "unknown")
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replaceAll("`", "\\`")
    .replaceAll("\n", " ");
}

function formatInteger(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value).toLocaleString("en-US") : "unknown";
}

function formatCost(costMicros: unknown) {
  return typeof costMicros === "number" && Number.isFinite(costMicros)
    ? `$${(costMicros / 1_000_000).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "unknown";
}

function notFound(handle: string) {
  const body = `# UsageMax profile not found\n\nNo public profile is available for **@${markdownText(handle)}**. See the [leaderboard](${origin}/leaderboard) or [UsageMax documentation](${origin}/docs).\n`;
  return new Response(body, {
    status: 404,
    headers: {
      "cache-control": "public, max-age=60, stale-while-revalidate=300",
      "content-type": "text/markdown; charset=utf-8",
      vary: "Accept, User-Agent",
    },
  });
}

function responseHeaders(handle: string) {
  return {
    "cache-control": "public, max-age=60, stale-while-revalidate=300",
    "content-type": "text/markdown; charset=utf-8",
    link: `<${origin}/${encodeURIComponent(handle)}>; rel="canonical", <${origin}/${encodeURIComponent(handle)}.md>; rel="alternate"; type="text/markdown"`,
    vary: "Accept, User-Agent",
  };
}

export async function GET(request: Request) {
  const handle = normalizeHandle(new URL(request.url).searchParams.get("handle") ?? "");
  if (!/^[a-z0-9_-]{1,80}$/.test(handle)) return notFound(handle || "unknown");

  const profile = await fetchQuery(api.public.profile, { handle });
  if (!profile?.stats) return notFound(handle);

  const { profile: identity, stats, models } = profile;
  const identityHandle = normalizeHandle(identity.handle);
  const displayName = identity.displayName || identityHandle;
  const description = `Public UsageMax AI usage profile for @${identityHandle}.`;
  const modelRows = models.length
    ? models.map((model, index) => `| ${index + 1} | ${markdownText(model.provider)} | ${markdownText(model.model)} | ${formatInteger(model.totalTokens)} | ${formatCost(model.costMicros)} |`).join("\n")
    : "| — | — | No model totals reported | — | — |";
  const markdown = `---
title: "@${markdownText(identityHandle)} · UsageMax profile"
description: "${description}"
canonical: ${origin}/${encodeURIComponent(identityHandle)}
last-updated: ${new Date().toISOString().slice(0, 10)}
---

# @${markdownText(identityHandle)} · UsageMax profile

${markdownText(displayName)}${identity.isVerified ? " · verified" : ""}

Public, opt-in aggregate usage from UsageMax. Prompts, completions, source code, file paths, credentials, and private workspace data are not included.

## Summary

| Measure | Value |
| --- | --- |
| Total tokens | ${formatInteger(stats.totalTokens)} |
| Tracked spend | ${formatCost(stats.totalCostMicros)} |
| Active days | ${formatInteger(stats.activeDays)} |
| Sessions | ${formatInteger(stats.sessions)} |
| Devices | ${formatInteger(stats.deviceCount)} |
| Current streak | ${formatInteger(stats.currentStreakDays)} days |
| First reported day | ${markdownText(stats.firstDay ?? "unknown")} |
| Last reported day | ${markdownText(stats.lastDay ?? "unknown")} |
| Top model | ${markdownText(stats.topModel ?? "unknown")} |
| Cost basis | ${markdownText(stats.costBasis ?? "unknown")} |

## Model mix

| Rank | Provider | Model | Tokens | Tracked spend |
| ---: | --- | --- | ---: | ---: |
${modelRows}

## Explore

- [HTML profile](${origin}/${encodeURIComponent(identityHandle)})
- [UsageMax methodology](${origin}/methodology)
- [UsageMax privacy boundary](${origin}/privacy)
- [UsageMax public API](${origin}/openapi.json)

This markdown representation is a read-only convenience for agents and documentation tools. It does not provide collector credentials or private data.
`;

  return new Response(markdown, { headers: responseHeaders(identityHandle) });
}

export async function HEAD(request: Request) {
  const handle = normalizeHandle(new URL(request.url).searchParams.get("handle") ?? "");
  return new Response(null, { headers: responseHeaders(handle || "profile") });
}
