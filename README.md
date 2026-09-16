# UsageMax

UsageMax is a privacy-first AI usage network: public work profiles and
leaderboards for individuals, plus realtime cost, agent, outcome, and
governance telemetry for teams.

The web application uses Next.js 16, WorkOS AuthKit, and Convex. The companion
CLI performs bounded, one-shot local history scans and sends aggregate usage to
the versioned `https://usagemax.com/api` contract.

## What the repository contains

- `src/` — Next.js application, public pages, API routes, and UI components.
- `convex/` — queries, mutations, HTTP ingestion, rollups, auth, and tests.
- `packages/cli/` — the publishable `usagemax` CLI package.
- `docs/` — architecture, collector coverage, telemetry, operations, and
  release documentation.
- `public/` and `brand/` — first-party static assets.

See [the architecture guide](docs/ARCHITECTURE.md) for the data flow and trust
boundaries.

## Try the CLI

The CLI is the quickest way to connect local coding-agent history:

```bash
bunx usagemax@latest link UMX-XXXX-XXXX-XXXX-XXXX
bunx usagemax status
bunx usagemax sync --dry-run --explain
```

Create a one-use link code at [usagemax.com/account](https://usagemax.com/account).
The CLI supports Node.js 20 or newer and Bun. It stores the per-installation
collector token in a user-only config file and never sends prompts, completions,
source code, file contents, project paths, or provider credentials.

See the [CLI guide](packages/cli/README.md) for supported providers, commands,
scheduled sync, recovery behavior, and known coverage limits.

## Product surface

These screenshots are captured from the rendered public site and kept here as
release documentation—not as UI mockups:

![UsageMax landing page](docs/screenshots/home.png)

![UsageMax counting methodology](docs/screenshots/methodology.png)

## Run the web app locally

Requirements: [Bun](https://bun.sh/) 1.4.2 and access to a development Convex
deployment. From the repository root:

```bash
bun install
bunx convex dev
bun run dev
```

The Vercel Marketplace Convex integration supplies
`CONVEX_DEPLOY_KEY`, `NEXT_PUBLIC_CONVEX_URL`, and
`NEXT_PUBLIC_CONVEX_SITE_URL`. WorkOS configuration is needed for sign-in and
workspace features; keep `WORKOS_API_KEY` and `WORKOS_COOKIE_PASSWORD` server
only. Copy values into an ignored `.env.local`; never commit credentials.

The normal verification command is:

```bash
bun run check
```

For focused work, `bunx vitest run path/to/test.ts` runs one test file and
`bun run cli:pack` verifies the CLI package contents without publishing it.

## Reproducible screenshots

The repository does not commit fabricated product mockups. Capture a rendered
local page after starting the app:

```bash
bun run dev
bunx playwright screenshot --device="Desktop Chrome" \
  http://localhost:3000 /tmp/usagemax-home.png
```

Use a public profile path such as `http://localhost:3000/<public-handle>` for
the profile view. The `/account` and `/workspace` views require a configured
WorkOS session. Review the image before sharing it; do not include tokens,
private profile data, or environment values in screenshots.

## API and privacy boundary

The public OpenAPI document is available at
[`/openapi.json`](https://usagemax.com/openapi.json). Public reads include
health, network stats, leaderboards, public profiles, daily usage, and bounded
daily detail. The authenticated CLI contract includes device linking,
revocation, native telemetry, OTLP/HTTP JSON traces, and snapshot v2.

Native events are content-free and limited to 1–100 events per 1 MiB JSON
request. Snapshot requests are limited to 2 MiB, with at most 100 session hashes
or 10 partitions per request and 100 rows per partition. Ingestion requires a
bearer collector token, a matching installation UUID, JSON, and an
`Idempotency-Key` where specified. The service applies collector and IP/WAF
limits; see [the telemetry contract](docs/telemetry-contract.md) for the exact
semantics.

Collector tokens are random, write-scoped, device-bound, rate-limited, and
revocable. The server stores only token hashes. UsageMax does not implement
OAuth delegation, accept arbitrary OTLP attributes, or claim support for
provider data that the source did not retain.

## Contributing and releasing

Read [CONTRIBUTING.md](CONTRIBUTING.md), follow the
[Code of Conduct](CODE_OF_CONDUCT.md), and report vulnerabilities using
[SECURITY.md](SECURITY.md), never a public issue. New issues and pull requests
use the repository templates under `.github/`.

Before a release, follow [docs/RELEASE.md](docs/RELEASE.md). It covers clean
source and lockfile checks, tests, the CLI pack check, backend compatibility,
secret scanning, artifact inspection, and the distinction between preparing a
release and publishing it.

The repository and CLI are MIT licensed. See [LICENSE](LICENSE) and
[NOTICE.md](NOTICE.md) for the license and dependency notice audit.
