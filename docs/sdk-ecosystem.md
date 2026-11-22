# SDK and integration surface

UsageMax publishes a Node.js/Bun CLI for collecting local provider history and a
Python SDK for public usage, installation-bound telemetry, and project-scoped
gateway receipts and reports.

## Supported clients

| Client | Status | Canonical surface |
| --- | --- | --- |
| Node.js / Bun CLI | Published | [`usagemax` on npm](https://www.npmjs.com/package/usagemax) |
| JavaScript/TypeScript application client | No package published | [OpenAPI](https://usagemax.com/openapi.json) |
| Python application client | Published | [`usagemax` on PyPI](https://pypi.org/project/usagemax/) · [Python SDK guide](https://docs.usagemax.com/python) |
| Go client | No package published | [OpenAPI](https://usagemax.com/openapi.json) |
| Agent integrations | Supported | [MCP](https://usagemax.com/mcp), [A2A](https://usagemax.com/a2a), and [WebMCP](https://usagemax.com/webmcp) |

The OpenAPI document is the source of truth for generated clients. A generated
client must preserve the authentication boundary: public reads are unauthenticated,
while collector writes require an installation-bound bearer token and device
header. Do not put collector tokens in source, URLs, browser code, or logs.

## CLI package metadata

The npm package is published as `usagemax`, versioned independently from the
web application, and exposes only the `usagemax` executable. Its package
manifest intentionally has no `exports` or `types` field. That is a contract,
not an omission: consumers should invoke the CLI rather than import internal
collector modules.

Install or run it without creating a resident process:

```bash
bunx usagemax --help
npx --yes usagemax -- --help
```

For an offline or pinned deployment, use the version selected by your release
process and verify the package tarball with `npm pack --dry-run`. See the [CLI
release checklist](RELEASE.md) before publishing.

## Python package

Install the SDK with `pip install usagemax`. Its version is independent of the
npm CLI. The release workflow publishes the wheel and source distribution from
the repository's `pypi` environment using Trusted Publishing. See the
[package README](../packages/python/README.md#maintainer-release) for release steps.

## Discovery

Agents can discover the same boundaries from the [developer index](https://usagemax.com/developers/llms.txt),
[agent mode](https://usagemax.com/?mode=agent), and [OpenAPI contract](https://usagemax.com/openapi.json).
The agent metadata links only to packages and registries that exist; it does
not advertise speculative SDK names.
