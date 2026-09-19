# SDK and integration surface

UsageMax currently ships one installable package: the `usagemax` CLI on npm.
It is a short-lived Node.js/Bun process for collecting local provider history;
it is not an importable JavaScript, Python, or Go SDK. This distinction is
intentional: it keeps credentials and filesystem access in the local collector
and avoids implying that an unpublished client is supported.

## Supported clients

| Client | Status | Canonical surface |
| --- | --- | --- |
| Node.js / Bun CLI | Published | [`usagemax` on npm](https://www.npmjs.com/package/usagemax) |
| JavaScript/TypeScript application client | No package published | [OpenAPI](https://usagemax.com/openapi.json) |
| Python client | No package published | [OpenAPI](https://usagemax.com/openapi.json) |
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
bunx usagemax@latest --help
npx --yes usagemax@latest -- --help
```

For an offline or pinned deployment, use the version selected by your release
process and verify the package tarball with `npm pack --dry-run`. See the [CLI
release checklist](RELEASE.md) before publishing. This repository does not
claim a Python or Go registry package until one is reviewed, published, and
added here with a verified registry URL.

## Discovery

Agents can discover the same boundaries from the [developer index](https://usagemax.com/developers/llms.txt),
[agent mode](https://usagemax.com/?mode=agent), and [OpenAPI contract](https://usagemax.com/openapi.json).
The agent metadata links only to packages and registries that exist; it does
not advertise speculative SDK names.
