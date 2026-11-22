# UsageMax for Python

Use UsageMax from a Python service, script, or notebook. The client supports Python 3.10 and later and has zero runtime dependencies.

```bash
pip install usagemax
```

## Read public usage

```python
from usagemax import UsageMax

usage = UsageMax()
print(usage.health()["ok"])
print(usage.stats()["stats"])
```

Use `profile(handle)` or `daily_usage(handle, days=30, group_by="model")` for opt-in public profiles. For a large result, use `daily_detail()` with an inclusive UTC date range and pass `continueCursor` back as `cursor` until `isDone` is true. Sum additive rows across all pages for full-range totals.

## Read private gateway reports

Create a report key in [your gateway workspace](https://usagemax.com/workspace/gateway). Store it in your server's secret manager and pass it to the client.

```python
import os
from datetime import datetime, timedelta, timezone

from usagemax import GatewayClient

gateway = GatewayClient(os.environ["USAGEMAX_GATEWAY_REPORT_TOKEN"])
today = datetime.now(timezone.utc).date()
report = gateway.operations(start=today - timedelta(days=6), through=today)
print(report["overall"]["requests"], report["truncated"])
```

Use `receipts()` for a bounded list and `receipt(request_id)` for one receipt. Use a separate ingest key for `write_receipts()`. Check the status of every receipt returned by the batch write and reuse the original request ID, revision, and fields on a retry.

## Send content-free telemetry

Create a custom collector under [your account](https://usagemax.com/account?setup=telemetry#custom-telemetry). Generate and persist a stable installation UUID when provisioning the collector. Keep using that UUID for all requests from that installation.

```python
import os

from usagemax import CollectorClient

collector = CollectorClient(
    os.environ["USAGEMAX_COLLECTOR_TOKEN"],
    device_id=os.environ["USAGEMAX_DEVICE_ID"],
)

def record_request(request_id, model, occurred_at, input_tokens, output_tokens):
    return collector.send_events(
        [{
            "eventKey": request_id,
            "model": model,
            "occurredAt": occurred_at,
            "inputTokens": input_tokens,
            "outputTokens": output_tokens,
        }],
        idempotency_key=request_id,
    )
```

Use the actual event time in ISO 8601 or Unix milliseconds. Reuse the original payload and idempotency key when retrying. Use `send_traces()` for OTLP/HTTP JSON. Filter prompts, responses, and other sensitive attributes at the source before sending an event or trace.

## Handle errors

`APIError` provides `status_code`, `code` when the API supplies one, and `retry_after` when present. `TransportError` covers network failures and unreadable responses. Requests are synchronous and use a configurable timeout. Handle retries in your application or durable outbox.

The [OpenAPI contract](https://usagemax.com/openapi.json) documents request and response fields. For scanning local coding-agent usage, see the [UsageMax CLI](https://docs.usagemax.com/cli).

## Maintainer release

Bump the version in `pyproject.toml`, merge the tested change into `main`, and dispatch the workflow with that exact version.

```bash
gh workflow run publish-python.yml --ref main -f version=0.1.0
```

The workflow uses the dedicated `pypi` environment and PyPI Trusted Publishing. It builds and tests the distributions before the publishing job receives OIDC permissions.
