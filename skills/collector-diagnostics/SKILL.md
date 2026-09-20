---
name: collector-diagnostics
description: Diagnose a UsageMax collector credential and installation binding safely without exposing secrets or changing accounting totals.
---

# UsageMax collector diagnostics

Use this skill when a local collector receives `401`, `409`, or unexpected
ingestion results. The diagnostic path is read-only and must never print,
persist, or transmit the collector secret outside the HTTPS `Authorization`
header.

## Safe status check

For a key that is not stored by the CLI, pipe it through stdin and pass the
stable installation UUID separately:

```bash
set +x
printf '%s' "$USAGEMAX_COLLECTOR_TOKEN" \
  | bunx usagemax token status \
      --device-id "$USAGEMAX_INSTALLATION_ID" --json
```

The response is a bounded projection. It can report the credential type,
active/revoked state, scopes, profile and computer name, and whether the
installation is `unbound`, `bound`, `matched`, or `mismatch`. It never returns
the token, its hash, or the authorized UUID.

## Numeric-only smoke result

For automation, keep only the HTTP status and authorization bit:

```bash
set +x
printf '%s' "$USAGEMAX_COLLECTOR_TOKEN" \
  | bunx usagemax token status \
      --device-id "$USAGEMAX_INSTALLATION_ID" --json \
  | jq -r '[.httpStatus, (if .ingestAuthorized then 1 else 0 end)] | @tsv'
```

`200 1` is active and authorized. `200 0` is recognized but blocked. `409 0`
is a device-binding mismatch. `401 0` is a rejected or unrecognized key.

## Zero-accounting telemetry test

When a write-path test is necessary, send one `agent_state` event with
`accountingMode: observability`, `totalTokens: 0`, and `costMicros: 0` to
`https://usagemax.com/api/v1/telemetry/llm`. Give it a unique
`Idempotency-Key`. Do not include prompts, completions, source code, file
paths, credentials, or free-form tool payloads. This event is display-only and
cannot change token or spend totals.
