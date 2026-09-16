const markdown = `---
title: UsageMax sandbox
description: Validate content-free UsageMax telemetry without writing production data.
canonical: https://usagemax.com/sandbox
last-updated: 2026-09-16
---

# UsageMax sandbox

The UsageMax sandbox is a no-write validator for content-free telemetry. Use it to exercise your serializer and field limits before sending a linked collector request to production.

## Endpoint

Send a JSON POST to [POST /api/v1/sandbox/validate](https://usagemax.com/api/v1/sandbox/validate). It accepts 1 to 100 bounded events and a maximum body size of 16 KiB. It never authenticates, stores, schedules, or publishes the submitted values.

~~~json
{
  "events": [
    {
      "eventKey": "sandbox-example-1",
      "model": "example-model",
      "occurredAt": "2026-09-16T12:00:00Z",
      "eventType": "model_request",
      "totalTokens": 0,
      "costMicros": 0
    }
  ]
}
~~~

The [sandbox descriptor](https://usagemax.com/api/v1/sandbox) is machine-readable. A successful response includes \`writes: false\`. Prompts, completions, credentials, source code, file paths, and arbitrary fields are rejected; use the [OpenAPI contract](https://usagemax.com/openapi.json) for the current schema.

## Try it without an account

This request is deliberately content-free and does not need a token, device ID,
or UsageMax account. It validates one observability event and cannot change
production totals:

~~~bash
curl -fsS -w '\\nHTTP %{http_code}\\n' \\
  -X POST https://usagemax.com/api/v1/sandbox/validate \\
  -H 'content-type: application/json' \\
  --data '{"events":[{"eventKey":"sandbox-example-1","eventType":"agent_state","accountingMode":"observability","source":"local-test","provider":"usagemax","model":"relay-activity","inputTokens":0,"outputTokens":0,"cacheReadTokens":0,"cacheWriteTokens":0,"reasoningTokens":0,"totalTokens":0,"costMicros":0,"status":"ok","state":"diagnostic","occurredAt":"2026-09-16T12:00:00Z","schemaVersion":1,"completeness":"unknown"}]}'
~~~

The expected response is HTTP 200 with \`ok: true\`, \`accepted: 1\`, and
\`writes: false\`. Use a current UTC timestamp when testing outside the
documented example date.
`;

export function GET() {
  return new Response(markdown, {
    headers: {
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
      "content-type": "text/markdown; charset=utf-8",
      vary: "Accept, User-Agent",
    },
  });
}

export function HEAD() {
  return new Response(null, {
    headers: {
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
      "content-type": "text/markdown; charset=utf-8",
      vary: "Accept, User-Agent",
    },
  });
}
