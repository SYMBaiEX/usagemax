const markdown = `# UsageMax privacy

UsageMax may receive telemetry metadata such as model, provider, token counts, status, latency, task labels, agent identifiers, and timestamps. Do not send prompts, completions, secrets, or access tokens.

Public profiles expose aggregate data only when published by the service. See the [privacy policy](/privacy).
`;
export function GET() { return new Response(markdown, { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=3600, stale-while-revalidate=86400", vary: "Accept" } }); }
