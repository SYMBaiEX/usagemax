const markdown = `---
title: UsageMax page not found
description: Recovery links for an unavailable UsageMax URL.
canonical: https://usagemax.com/not-found.md
last-updated: 2026-09-16
---

# UsageMax page not found

The requested URL does not exist or is not public.

- [Home](https://usagemax.com/)
- [Documentation](https://usagemax.com/docs)
- [Agent guide](https://usagemax.com/llms.txt)
- [Sitemap](https://usagemax.com/sitemap.xml)
- [API catalog](https://usagemax.com/.well-known/api-catalog)
`;

const headers = {
  "cache-control": "public, max-age=300",
  "content-type": "text/markdown; charset=utf-8",
  vary: "Accept, User-Agent",
};

export function GET() {
  return new Response(markdown, { status: 404, headers });
}

export function HEAD() {
  return new Response(null, { status: 404, headers });
}
