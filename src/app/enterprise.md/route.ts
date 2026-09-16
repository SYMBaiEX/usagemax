const markdown = `# UsageMax for teams

UsageMax provides private workspaces, scoped roles, connected computers, and bounded telemetry for teams. Enterprise capacity, SSO, directory setup, security, residency, and support commitments are agreed and verified during onboarding.

See the [team page](/enterprise) and [security overview](/security).
`;
export function GET() { return new Response(markdown, { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=3600, stale-while-revalidate=86400", vary: "Accept" } }); }
