const markdown = `# UsageMax authentication

UsageMax separates public read access, website sign-in, and local collector uploads. This document describes the credentials that actually exist today; UsageMax does not expose a general OAuth token exchange for API delegation.

## Discover

Read the [OpenAPI contract](https://usagemax.com/openapi.json), the [protected-resource metadata](https://usagemax.com/.well-known/oauth-protected-resource), and the [documentation](https://usagemax.com/docs) before integrating. Public profiles, network statistics, leaderboard data, and bounded documentation reads do not require credentials. The metadata is a protected-resource description, not an OAuth authorization-server directory.

## Pick a method

Use public HTTPS reads for public aggregate data. Use the UsageMax CLI for a person's own local history. Use a write-only collector token only when uploading content-free telemetry or usage snapshots from a linked installation. Website sign-in uses WorkOS AuthKit for the UsageMax account UI; that browser session is not an API bearer token and must not be sent to ingestion endpoints.

## Register

Open [UsageMax sign-in](https://usagemax.com/sign-in), complete the WorkOS browser sign-in, then open [Account](https://usagemax.com/account) and use the computer/collector connection control to create a one-use link code for the computer or CI installation. The code is short-lived and is consumed once. Do not put the code or a collector token in a URL, source repository, prompt, completion, or log.

## Claim

Run \`bunx usagemax@latest link <one-use-code>\` on the installation. The CLI sends the code to [POST /api/v1/devices/link](https://usagemax.com/api/v1/devices/link) over HTTPS and stores the returned write-only token in a private local configuration file. The token is returned once and is bound to that installation. Use \`bunx usagemax@latest status\` to inspect local link state without printing the secret.

## Diagnose

New collector keys are active as soon as the authenticated account action creates them; there is no separate activation or propagation step. To check the stored credential, installation binding, scopes, profile, account-side computer name, and last accepted write without printing the token, run \`bunx usagemax@latest status --remote\`. For a key created in **Advanced · custom telemetry collector**, pipe the secret through stdin instead of putting it in shell history or process arguments:

    printf '%s' "$USAGEMAX_COLLECTOR_TOKEN" | bunx usagemax@latest token status --device-id "$USAGEMAX_INSTALLATION_ID"

The diagnostic endpoint is read-only. It reports \`active\`, \`revoked\`, \`workspace_disabled\`, \`membership_inactive\`, or \`device_mismatch\` when the bearer token is recognized. An unrecognized token returns a generic 401 and never reveals whether another key exists. A collector created by the advanced flow starts unbound and adopts the first valid installation UUID on its first write; a linked CLI key is already bound.

## Exchange

There is no OAuth authorization-server exchange or token endpoint for the UsageMax API at this time. The protected-resource metadata therefore intentionally has no \`authorization_servers\`, \`authorization_endpoint\`, or \`token_endpoint\` claim. There is also no \`identity_endpoint\`, \`claim_endpoint\`, \`events_endpoint\`, or agent \`service_auth\` flow. Do not mint or infer an OAuth access token from the WorkOS website session. The one-use link-code exchange above is the only supported way to create a collector credential.

## Use the access token

For collector writes, send the token in an HTTPS header and include the stable installation identifier. The token is usable only with the linked installation and the documented write endpoints:

    Authorization: Bearer umx_<64 lowercase hexadecimal characters>
    x-usagemax-device-id: <installation UUID>
    Idempotency-Key: <unique operation key>

Use [native telemetry](https://usagemax.com/api/v1/telemetry/llm), [traces](https://usagemax.com/api/v1/traces), or [usage snapshots](https://usagemax.com/api/v2/usage/snapshots) as documented by OpenAPI. Validate a batch first with the [no-write sandbox descriptor](https://usagemax.com/api/v1/sandbox). The device-link, status, and revoke URLs are returned by the link response; no token-exchange URL is returned.

Send only aggregate or content-free telemetry. Prompts, completions, source code, file paths, tool arguments, credentials, and secrets are rejected by policy and must never be sent. The token is accepted only on the documented collector endpoints and is not accepted in a request body or query string.

## Errors

Errors are JSON objects with stable \`error\`, human-readable \`message\`, and recovery \`hint\` fields. A missing or malformed collector credential returns HTTP 401 with a \`WWW-Authenticate\` pointer to the protected-resource metadata. A request that exceeds its documented limit returns 413; unsupported content types return 415; idempotency or device conflicts return 409; rate limits return 429.

## Revocation

Revoke a linked installation from the authenticated UsageMax account, or send the collector credential to \`POST /api/v1/devices/revoke\` with the same installation UUID. Remove the local config only after revocation if you want to prevent future uploads. Re-linking creates a new installation credential; old tokens remain invalid.

## Privacy boundary

UsageMax stores bounded projections for public profiles and enterprise reporting. The collector is designed as a short-lived one-shot process, and optional OS scheduling invokes it periodically without a resident watcher. See [Security](https://usagemax.com/security) and [Privacy](https://usagemax.com/privacy) for the data boundary.
`;

const headers = {
  "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
  "content-type": "text/markdown; charset=utf-8",
  vary: "Accept",
};

export function GET() {
  return new Response(markdown, { headers });
}

export function HEAD() {
  return new Response(null, { headers });
}
