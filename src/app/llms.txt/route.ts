const llmsText = `# UsageMax

> UsageMax is a public observability layer for builders running serious AI systems. It turns reported model, tool, agent, and outcome telemetry into compact, bounded public projections.

## Public pages

- [Home](https://usagemax.com/): product overview and realtime network signal
- [Leaderboard](https://usagemax.com/leaderboard): ranked public profiles by tokens or indexed spend
- [symbaiex profile](https://usagemax.com/symbaiex): featured public telemetry profile
- [Documentation](https://usagemax.com/docs): native telemetry and OpenTelemetry ingestion
- [Methodology](https://usagemax.com/methodology): aggregation, completeness, and ranking definitions
- [Security](https://usagemax.com/security): public data boundaries and bounded reads
- [Enterprise](https://usagemax.com/enterprise): team operating surface
- [Privacy](https://usagemax.com/privacy): telemetry and public profile handling
- [Terms](https://usagemax.com/terms): public service terms

## Public data contract

The public UI reads bounded Convex projections for network totals, leaderboard entries, public profile totals and model mix, daily rollups, active agents, and a short live event window. It does not expose prompts, completions, credentials, or raw unbounded event history.

## Ingestion

Telemetry can be sent to the native endpoint at /api/v1/telemetry/llm or the OpenTelemetry traces endpoint at /api/v1/traces. Send only metadata intended for processing; do not send secrets or prompt content.
`;

export function GET() {
  return new Response(llmsText, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
