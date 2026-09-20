# UsageMax architecture

## Runtime shape

The web app is a Next.js application deployed on Vercel. WorkOS AuthKit owns
interactive identity and session setup. Convex owns application data,
queries/mutations, realtime subscriptions, rollups, and the HTTP actions used
by collectors. The CLI is a separate Node.js/Bun package under
`packages/cli/`; it is not a browser bundle and does not contain deployment
credentials.

## Data flow

```text
local provider history
        |
        v
CLI bounded scan -> snapshot v2 / native telemetry / OTLP JSON
        |
        v
Vercel API route -> Convex HTTP action -> hashed auth + validation + idempotency
        |
        v
Convex records -> aggregate rollups -> public projections / private workspace views
```

The CLI normally sends authoritative aggregate snapshot partitions for local
coding-agent history. Native and OTLP event batches record content-free live
telemetry. Both paths are authenticated and bounded before persistence.

## Trust and privacy boundaries

- WorkOS credentials and session secrets stay server-side.
- Collector credentials are generated once, stored locally with user-only
  permissions where supported, and stored server-side only as SHA-256 hashes.
- Installation IDs are stable random UUIDs, not hardware fingerprints; the
  service stores their hashes and uses them for device binding.
- Public profiles are opt-in projections. Public queries do not read private
  workspace records.
- Ingestion excludes prompts, completions, source code, file contents, project
  paths, tool arguments/output, environment variables, and arbitrary OTLP
  attributes.
- Costs retain their provenance (`reported`, `estimated`, `unknown`, or the
  applicable aggregate basis). Unknown pricing is not guessed.

## Deliberate boundaries

The local collector is a one-shot process. Optional OS scheduling runs that
process periodically; it is not a resident daemon or file watcher. The public
screen endpoint is retired because the local HUD is a separate project.

The repository does not claim to mint or broker WorkOS credentials itself;
delegated OAuth is provided by the configured WorkOS Connect authorization
server. UsageMax validates its signed resource tokens and does not expose
client secrets. The repository does not claim live
provider coverage that is unavailable in local history, or production capacity
from unit tests alone.

For payload fields and limits, use the versioned
[telemetry contract](telemetry-contract.md) and generated
[OpenAPI document](../src/lib/openapi.ts).
