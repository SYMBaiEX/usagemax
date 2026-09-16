# Contributing to UsageMax

Thanks for helping improve UsageMax. Keep changes focused, explain the user
impact, and preserve the privacy and accounting boundaries described in the
repository documentation.

## Before you start

Search existing issues and pull requests before opening a new one. For a
substantial feature, open a proposal first so scope and data-handling impact
are understood. Never include real collector tokens, WorkOS credentials,
provider credentials, prompts, completions, or customer data in an issue,
fixture, screenshot, or pull request.

## Development setup

Use Bun 1.4.2 and Node.js 20 or newer:

```bash
bun install
bun run dev
```

The web app needs a configured Convex development deployment. The CLI tests
are local and can be run independently:

```bash
bun run lint
bun run typecheck
bun run test
bun run cli:pack
```

Run a focused test while iterating, then run the full relevant command before
requesting review. If a check cannot run because an external service or
credential is unavailable, report it as skipped with the reason.

## Change guidance

- Keep API changes backwards compatible unless the change explicitly updates
  the versioned contract and its tests.
- Validate request size and untrusted input before parsing or allocating more
  work. Reuse existing response and auth helpers.
- Treat public data as opt-in and aggregate. Do not add raw content to
  telemetry.
- Keep accounting categories and pricing provenance explicit; do not turn
  missing data into a zero or an estimate.
- Add or update focused tests for behavior changes and documentation examples.
- Prefer small commits with a descriptive imperative subject. Do not commit
  secrets or generated local state.

## Pull requests

Use the pull request template. Include the problem, the exact scope, tests run
(with pass/skip distinction), privacy or accounting impact, and any follow-up
work. Keep unrelated formatting and generated files out of the diff. A
maintainer may request a smaller change when the design or operational impact
is not yet agreed.

## Release changes

Do not publish packages, create GitHub releases, deploy Convex/Vercel, or alter
external services from a normal development pull request. Maintainers follow
[docs/RELEASE.md](docs/RELEASE.md) for those actions.
