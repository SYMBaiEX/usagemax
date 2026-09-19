const body = `# UsageMax agent rules

UsageMax is an open-source, privacy-first AI usage observability service.
This public copy is the canonical runtime guidance for agents working with
the UsageMax website and API. Prefer read-only public endpoints, respect the
published limits, and never send prompts, completions, source code, or
credentials to telemetry endpoints.

The contributor rules and complete implementation are maintained in the
canonical repository:
https://github.com/SYMBaiEX/usagemax/blob/main/AGENTS.md

Machine-readable discovery starts at:
https://usagemax.com/llms.txt
`;

const headers = {
  "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
  "content-type": "text/markdown; charset=utf-8",
  "content-location": "https://usagemax.com/AGENTS.md",
  "x-content-type-options": "nosniff",
};

export const dynamic = "force-static";

export function GET() {
  return new Response(body, { headers });
}

export function HEAD() {
  return new Response(null, { headers });
}
