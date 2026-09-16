# Release checklist

This checklist prepares a release; it does not authorize publication,
deployment, or external announcements.

## Source and policy

- [ ] Review `git status` and isolate unrelated changes.
- [ ] Confirm README, architecture, collector privacy boundary, contributor
      guide, security policy, code of conduct, license, and notice are current.
- [ ] Check documentation links and run the screenshot workflow locally when
      UI documentation changed.
- [ ] Confirm no secrets, `.env*` files, tokens, private URLs, customer data,
      or generated local state are staged.
- [ ] Review dependency licenses and lockfile changes for the release.

## Verification

```bash
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run test
bun run cli:pack
bun run build
git diff --check
```

- [ ] Record each command as pass or skipped with a reason; do not turn a skip
      into release evidence.
- [ ] Inspect the CLI dry-run and package contents.
- [ ] If the API changed, validate the generated OpenAPI JSON and run focused
      route/contract tests.
- [ ] If the backend changed, run the relevant Convex tests and verify the
      deployed backend supports the CLI protocol before publishing the package.

## Artifact and live checks

- [ ] Verify package name, version, files, engine range, and license metadata.
- [ ] Build from the intended commit and retain the commit SHA with the
      artifact record.
- [ ] Only after all checks pass, follow the maintainer-controlled publish and
      deployment procedure.
- [ ] After publication/deployment, independently check the public package,
      `/openapi.json`, health endpoint, CLI install, and one safe read-only
      user-facing path.
- [ ] Report publication, deployment, and live verification separately.

## Rollback

- [ ] Keep the prior known-good package version and deployment reference.
- [ ] If a release is withdrawn, document the affected version, reason,
      mitigation, and user action without exposing secrets or private data.
