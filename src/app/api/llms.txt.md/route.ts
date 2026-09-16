const markdown = `# UsageMax API

Read the [OpenAPI contract](https://usagemax.com/openapi.json) and [authentication guide](https://usagemax.com/auth.md). Public reads require no credential. Collector writes use an installation-bound write-only token and never accept prompts, completions, source code, credentials, or secrets.

The [sandbox descriptor](https://usagemax.com/api/v1/sandbox) validates a bounded batch without writing it.

<!-- title: UsageMax API agent guide; canonical: https://usagemax.com/api/llms.txt; last-updated: 2026-09-16 -->
`;

export function GET() { return new Response(markdown, { headers: { "cache-control": "public, max-age=3600", "content-type": "text/markdown; charset=utf-8", vary: "Accept, User-Agent" } }); }
