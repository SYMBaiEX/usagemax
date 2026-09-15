# UsageMax security policy

## Reporting a vulnerability

Please report suspected vulnerabilities privately to `hello@usagemax.com`. Include
the affected surface, reproduction steps, expected impact, and any request ID
returned by the API. Do not include collector keys, OAuth codes, model-provider
credentials, prompts, completions, or customer data in the initial report.

We ask researchers not to access or modify data that is not their own, degrade the
service, or publish a vulnerability before a coordinated fix is available.

## Supported releases

The production service and the latest published `usagemax` CLI release receive
security fixes. Older CLI versions may be refused by the service when a protocol
or security boundary changes.

## Security boundaries

- WorkOS AuthKit authenticates users and supplies signed organization, role, and
  permission claims.
- Convex rechecks workspace membership and permissions on private operations.
- Collector tokens are random, write-scoped, stored as SHA-256 hashes, revocable,
  device-bound after linking, rate-limited, and protected by idempotency receipts.
- UsageMax accepts aggregate telemetry metadata. Prompt bodies, completion bodies,
  source code, social passwords, and model-provider credentials are outside the
  ingestion contract.
- Public profiles are opt-in projections. Private workspace data is never queried
  through public profile functions.

The detailed public posture is maintained at
[usagemax.com/security](https://usagemax.com/security).
