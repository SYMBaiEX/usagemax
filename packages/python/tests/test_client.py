import io
import json
import unittest
from datetime import date
from email.message import Message
from unittest.mock import patch
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlsplit

from usagemax import APIError, CollectorClient, GatewayClient, TransportError, UsageMax

DEVICE_ID = "b14aaf91-f7e5-4aad-af61-d0aefbd150c1"


class ClientTests(unittest.TestCase):
    def setUp(self):
        opener = patch("usagemax.client.build_opener")
        self.build_opener = opener.start()
        self.addCleanup(opener.stop)
        self.open = self.build_opener.return_value.open
        self.open.side_effect = lambda *_args, **_kwargs: io.BytesIO(b'{"ok":true}')

    def request(self):
        return self.open.call_args.args[0]

    def test_public_health_without_credentials(self):
        self.assertEqual(UsageMax(timeout=2).health(), {"ok": True})
        request = self.request()
        self.assertEqual(request.full_url, "https://usagemax.com/api/health")
        self.assertNotIn("Authorization", request.headers)
        self.assertEqual(self.open.call_args.kwargs["timeout"], 2)

    def test_daily_detail_passes_opaque_cursor_and_inclusive_dates(self):
        UsageMax().daily_detail(
            "@example", start=date(2026, 11, 1), through="2026-11-22",
            group_by="source", cursor="page+2&x",
        )
        url = urlsplit(self.request().full_url)
        self.assertEqual(url.path, "/api/profiles/example/daily/detail")
        self.assertEqual(parse_qs(url.query), {
            "from": ["2026-11-01"], "through": ["2026-11-22"],
            "groupBy": ["source"], "limit": ["100"], "cursor": ["page+2&x"],
        })

    def test_gateway_read_and_write(self):
        gateway = GatewayClient("example-key")
        gateway.receipt("gateway:request.1")
        self.assertEqual(self.request().full_url, "https://usagemax.com/api/v1/gateway/receipts/gateway%3Arequest.1")
        self.assertEqual(self.request().get_header("Authorization"), "Bearer example-key")

        receipts = [{"requestId": "gateway:request.1", "revision": 1}]
        gateway.write_receipts(receipts)
        self.assertEqual(self.request().get_method(), "POST")
        self.assertEqual(self.request().get_header("Content-type"), "application/json")
        self.assertEqual(json.loads(self.request().data), {"receipts": receipts})
        self.assertIsNone(self.request().get_header("X-usagemax-device-id"))

        gateway.operations(start="2026-11-22", through="2026-11-22")
        self.assertEqual(urlsplit(self.request().full_url).path, "/api/v1/gateway/operations")

    def test_collector_writes_device_and_idempotency_headers(self):
        collector = CollectorClient("collector-key", device_id=DEVICE_ID)
        first = {"eventKey": "test", "model": "example", "inputTokens": 1}
        collector.send_events([first], idempotency_key="my-batch:1")
        request = self.request()
        self.assertEqual(urlsplit(request.full_url).path, "/api/v1/telemetry/llm")
        self.assertEqual(request.get_header("X-usagemax-device-id"), DEVICE_ID)
        self.assertEqual(request.get_header("Idempotency-key"), "my-batch:1")
        self.assertEqual(request.get_header("Authorization"), "Bearer collector-key")
        collector.send_events([dict(reversed(list(first.items())))], idempotency_key="my-batch:1")
        self.assertEqual(request.data, self.request().data)

        collector.send_traces({"resourceSpans": []}, idempotency_key="trace:1")
        self.assertEqual(urlsplit(self.request().full_url).path, "/api/v1/traces")
        self.assertEqual(json.loads(self.request().data), {"resourceSpans": []})

    def test_status_allows_unbound_read_but_writes_require_device(self):
        collector = CollectorClient("collector-key")
        collector.status()
        self.assertEqual(urlsplit(self.request().full_url).path, "/api/v1/devices/status")
        self.assertIsNone(self.request().get_header("X-usagemax-device-id"))
        with self.assertRaisesRegex(ValueError, "device_id is required"):
            collector.send_events([{"eventKey": "event"}], idempotency_key="batch")
        self.assertEqual(self.open.call_count, 1)

    def test_rejects_invalid_paths_origins_headers_dates_and_batches(self):
        with self.assertRaisesRegex(ValueError, "profile handle"):
            UsageMax().profile("../account")
        with self.assertRaisesRegex(ValueError, "request ID"):
            GatewayClient("key").receipt("..")
        with self.assertRaisesRegex(ValueError, "HTTPS origin"):
            CollectorClient("key", base_url="http://usagemax.com")
        with self.assertRaisesRegex(ValueError, "HTTPS origin"):
            GatewayClient("key", base_url="https://key@usagemax.com")
        with self.assertRaisesRegex(ValueError, "timeout"):
            UsageMax(timeout=float("inf"))
        with self.assertRaisesRegex(ValueError, "token"):
            GatewayClient("key\r\nX-Garbage: header")
        with self.assertRaisesRegex(ValueError, "on or before"):
            GatewayClient("key").receipts(start="2026-11-22", through="2026-11-21")
        with self.assertRaisesRegex(ValueError, "1 to 50"):
            GatewayClient("key").write_receipts([])
        with self.assertRaisesRegex(ValueError, "65536-byte"):
            GatewayClient("key").write_receipts([{"model": "x" * 65_536}])
        with self.assertRaisesRegex(ValueError, "idempotency_key"):
            CollectorClient("key", device_id=DEVICE_ID).send_events([{}], idempotency_key=" ")
        self.open.assert_not_called()

    def test_redirect_handler_never_follows_redirects(self):
        client = GatewayClient("key")
        redirect = self.build_opener.call_args.args[0]
        self.assertIsNone(redirect.redirect_request(None, None, 302, "", {}, "https://other.example"))
        self.open.side_effect = HTTPError(
            "https://usagemax.com/api/v1/gateway/status", 302, "", Message(), io.BytesIO(b""),
        )
        with self.assertRaises(APIError) as received:
            client.status()
        self.assertEqual(received.exception.status_code, 302)
        self.assertEqual(self.open.call_count, 1)

    def test_non_success_preserves_structured_error_and_retry_after(self):
        headers = Message()
        headers["Retry-After"] = "30"
        self.open.side_effect = HTTPError(
            "https://usagemax.com", 429, "Too Many Requests", headers,
            io.BytesIO(b'{"error":"rate_limited","hint":"internal details"}'),
        )
        with self.assertRaises(APIError) as raised:
            GatewayClient("example-token").status()
        self.assertEqual(raised.exception.status_code, 429)
        self.assertEqual(raised.exception.code, "rate_limited")
        self.assertEqual(raised.exception.retry_after, "30")
        self.assertNotIn("internal details", str(raised.exception))
        self.assertNotIn("example-token", str(raised.exception))

    def test_transport_and_response_errors(self):
        for response in (b"garbage", b"[]"):
            with self.subTest(response=response):
                self.open.side_effect = lambda *_args, **_kwargs: io.BytesIO(response)
                with self.assertRaises(TransportError):
                    UsageMax().health()
        self.open.side_effect = URLError("timed out")
        with self.assertRaises(TransportError):
            UsageMax().health()
