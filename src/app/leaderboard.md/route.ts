const markdown = `# UsageMax leaderboard

The leaderboard ranks public profiles by sustained AI usage or tracked cost over 7-day, 30-day, and all-time windows. Private workspace usage is excluded, and unknown costs are not presented as zero.

See the [leaderboard](/leaderboard).
`;
export function GET() { return new Response(markdown, { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=300", vary: "Accept" } }); }
