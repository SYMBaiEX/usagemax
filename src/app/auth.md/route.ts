const markdown = `# UsageMax authentication

<!-- title: UsageMax authentication; description: WorkOS delegated OAuth, agent registration, and installation-bound collector credentials.; canonical: https://usagemax.com/auth.md; last-updated: 2026-09-19 -->

UsageMax separates public reads, WorkOS delegated OAuth, and local collector uploads. WorkOS Connect is the authorization server: it owns consent, authorization codes, refresh, revocation, and signed access-token issuance. UsageMax never handles a WorkOS client secret or asks an agent to copy a website session cookie.

## Discover

Read the [OpenAPI contract](https://usagemax.com/openapi.json), the [protected-resource metadata](https://usagemax.com/.well-known/oauth-protected-resource), the [WorkOS authorization-server metadata](https://wholesome-car-48.authkit.app/.well-known/oauth-authorization-server), and the [documentation](https://usagemax.com/docs) before integrating. Public profiles, network statistics, leaderboard data, and bounded documentation reads do not require credentials.

## Pick a method

Use public HTTPS reads for public aggregate data. Use WorkOS delegated OAuth when an external agent or application needs a user-authorized UsageMax access token. Use the UsageMax CLI and a write-only collector token only when uploading content-free telemetry or usage snapshots from a linked installation. Website sign-in uses WorkOS AuthKit for the UsageMax account UI; that browser session is not an API bearer token and must not be sent to ingestion endpoints.

## Delegated OAuth through WorkOS Connect

The authorization server is the WorkOS AuthKit environment at \`https://wholesome-car-48.authkit.app\`. Discover its current endpoints from its [OAuth authorization-server metadata](https://wholesome-car-48.authkit.app/.well-known/oauth-authorization-server). The stable endpoints are:

- Authorization: \`https://wholesome-car-48.authkit.app/oauth2/authorize\`
- Token exchange and refresh: \`https://wholesome-car-48.authkit.app/oauth2/token\`
- JWKS for access-token verification: \`https://wholesome-car-48.authkit.app/oauth2/jwks\`
- Device authorization (for clients without a callback): \`https://wholesome-car-48.authkit.app/oauth2/device_authorization\`

Register a WorkOS Connect application and use its own client ID, secret handling, and pre-registered redirect URI. A confidential server exchanges the authorization code; a public/native client uses PKCE S256 and never embeds a client secret. Request only the permissions your WorkOS environment has enabled. UsageMax resource permissions are \`usage:read\`, \`data:export\`, \`telemetry:write\`, and \`outcomes:write\`; the standard identity scopes are \`openid profile email offline_access\`.

Authorization-code request (the external client owns \`state\`, \`nonce\`, and the PKCE verifier):

    https://wholesome-car-48.authkit.app/oauth2/authorize?client_id=<connect-client-id>&redirect_uri=<registered-redirect-uri>&response_type=code&scope=openid%20profile%20usage%3Aread&state=<opaque-state>&code_challenge=<s256-challenge>&code_challenge_method=S256

Exchange the one-use code server-to-server at the token endpoint with \`grant_type=authorization_code\`, the same \`redirect_uri\`, and the PKCE \`code_verifier\`. Store refresh tokens encrypted, rotate them, and keep access tokens in memory where possible. Validate access-token signature, issuer, audience, expiry, and required scope before using a private UsageMax operation.

### Agent Registration

For an AI agent that needs a claim ceremony, use the WorkOS Agent Registration guide at [the hosted agent auth skill](https://wholesome-car-48.authkit.app/agent/auth.md). The flow is WorkOS-owned and is not a UsageMax imitation:

1. \`POST https://wholesome-car-48.authkit.app/agent/identity\` with \`{"type":"service_auth"}\` (or \`{"type":"anonymous"}\` when no user is known).
2. Complete the returned claim verification URI with the user.
3. Exchange the signed identity assertion at \`/oauth2/token\` using \`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer\`.
4. Send the resulting short-lived bearer to UsageMax; the API validates the WorkOS issuer and JWKS and enforces the granted scope.

Agent Registration must be enabled in WorkOS under Authentication → Agents, with UsageMax permissions assigned to the trusted/untrusted levels. If that WorkOS setting is not enabled yet, the standard authorization-code flow remains available and the discovery document will not invent an \`agent_auth\` block.

## Register a local collector

Open [UsageMax sign-in](https://usagemax.com/sign-in), complete the WorkOS browser sign-in, then open [Account](https://usagemax.com/account) and use the computer/collector connection control to create a one-use link code for the computer or CI installation. The code is short-lived and is consumed once. Do not put the code or a collector token in a URL, source repository, prompt, completion, or log.

Run \`bunx usagemax link <one-use-code>\` on the installation. The CLI sends the code to [POST /api/v1/devices/link](https://usagemax.com/api/v1/devices/link) over HTTPS and stores the returned write-only token in a private local configuration file. The token is returned once and is bound to that installation. Use \`usagemax status\` to inspect local link state without printing the secret.

## Diagnose a collector

New collector keys are active as soon as the authenticated account action creates them; there is no separate activation or propagation step. To check the stored credential, installation binding, scopes, profile, account-side computer name, and last accepted write without printing the token, run \`usagemax status --remote\`. For a key created in **Advanced · custom telemetry collector**, pipe the secret through stdin instead of putting it in shell history or process arguments:

    printf '%s' "$USAGEMAX_COLLECTOR_TOKEN" | usagemax token status --device-id "$USAGEMAX_INSTALLATION_ID"

The diagnostic endpoint is read-only. It reports \`active\`, \`revoked\`, \`workspace_disabled\`, \`membership_inactive\`, \`device_mismatch\`, or \`scope_missing\` when the bearer token is recognized, and explicitly reports whether \`telemetry:write\` is authorized. An unrecognized token returns a generic 401 and never reveals whether another key exists. A collector created by the advanced flow starts unbound and adopts the first valid installation UUID on its first write; a linked CLI key is already bound. The \`token status\` subcommand is included in CLI \`0.3.9\`. The CLI can update a global installation with \`usagemax update\`, hand off a command with \`usagemax update sync\`, and supports the explicit \`USAGEMAX_AUTO_UPDATE=1\` handoff.

## Use a delegated access token

Send a WorkOS Connect access token only to the UsageMax operation it was granted for. Do not put a token in a URL, request body, prompt, source repository, completion, or log. A valid delegated token is a JWT issued by the WorkOS authorization server; an installation collector token begins with \`umx_\` and is a different credential class.

## Use a collector token

For collector writes, send the token in an HTTPS header and include the stable installation identifier:

    Authorization: Bearer umx_<64 lowercase hexadecimal characters>
    x-usagemax-device-id: <installation UUID>
    Idempotency-Key: <unique operation key>

Use [native telemetry](https://usagemax.com/api/v1/telemetry/llm), [traces](https://usagemax.com/api/v1/traces), or [usage snapshots](https://usagemax.com/api/v2/usage/snapshots) as documented by OpenAPI. Validate a batch first with the [no-write sandbox descriptor](https://usagemax.com/api/v1/sandbox). Send only aggregate or content-free telemetry. Prompts, completions, source code, file paths, tool arguments, credentials, and secrets are rejected by policy and must never be sent.

## Errors and revocation

Errors are JSON objects with stable \`error\`, human-readable \`message\`, and recovery \`hint\` fields. A missing or malformed credential returns HTTP 401 with a \`WWW-Authenticate\` pointer to the protected-resource metadata. A request that exceeds its documented limit returns 413; unsupported content types return 415; idempotency or device conflicts return 409; rate limits return 429.

Revoke a linked installation from the authenticated UsageMax account, or send the collector credential to \`POST /api/v1/devices/revoke\` with the same installation UUID. WorkOS delegated grants are revoked in WorkOS; UsageMax validates issuer, expiry, audience, and scope on every request. Re-linking creates a new installation credential; old collector tokens remain invalid.

## Privacy boundary

UsageMax stores bounded projections for public profiles and enterprise reporting. The collector is designed as a short-lived one-shot process, and optional OS scheduling invokes it periodically without a resident watcher. See [Security](https://usagemax.com/security) and [Privacy](https://usagemax.com/privacy) for the data boundary.
`;

const headers = {
  "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
  "content-type": "text/markdown; charset=utf-8",
  link: '<https://usagemax.com/auth.md>; rel="canonical"',
  "x-content-type-options": "nosniff",
  vary: "Accept, User-Agent",
};

export function GET() {
  return new Response(markdown, { headers });
}

export function HEAD() {
  return new Response(null, { headers });
}
