"""Synchronous clients for the UsageMax HTTP API."""

from __future__ import annotations

import json
import math
import re
from datetime import date
from typing import Any, Literal, Mapping, Sequence
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from uuid import UUID

JsonObject = dict[str, Any]
GroupBy = Literal["model", "source", "device"]
DEFAULT_URL = "https://usagemax.com"

_PROFILE_HANDLE = re.compile(r"[A-Za-z0-9_-]{1,80}")
_REQUEST_ID = re.compile(r"[A-Za-z0-9_-][A-Za-z0-9_.:-]{0,119}")
_HEADER_VALUE = re.compile(r"[!-~]+")


class APIError(Exception):
    """The API rejected a request. The exception omits the request and response bodies."""

    def __init__(self, status_code: int, code: str | None, retry_after: str | None) -> None:
        self.status_code = status_code
        self.code = code
        self.retry_after = retry_after
        super().__init__(f"UsageMax returned HTTP {status_code}" + (f" ({code})" if code else ""))


class TransportError(Exception):
    """The connection failed or UsageMax returned an unreadable response."""


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # urllib normally forwards ordinary request headers during redirects.
        return None


def _header_value(value: str, label: str, maximum: int | None = None) -> str:
    if not _HEADER_VALUE.fullmatch(value) or (maximum is not None and len(value) > maximum):
        raise ValueError(f"{label} must be a nonempty printable ASCII value without spaces")
    return value


def _segment(value: str, pattern: re.Pattern[str], label: str) -> str:
    if not pattern.fullmatch(value):
        raise ValueError(f"Invalid {label}")
    return quote(value, safe="")


def _range(start: date | str, through: date | str) -> dict[str, str]:
    def iso(value: date | str) -> str:
        return date.fromisoformat(value if isinstance(value, str) else value.isoformat()).isoformat()

    first, last = iso(start), iso(through)
    if first > last:
        raise ValueError("start must be on or before through")
    return {"from": first, "through": last}


class _HTTP:
    def __init__(self, base_url: str, timeout: float, token: str | None = None) -> None:
        url = urlsplit(base_url)
        if (url.scheme != "https" or not url.hostname or url.username is not None
                or url.password is not None or url.query or url.fragment
                or url.path not in ("", "/")):
            raise ValueError("base_url must be an HTTPS origin without credentials")
        if not math.isfinite(timeout) or timeout <= 0:
            raise ValueError("timeout must be positive and finite")
        self._origin = f"https://{url.netloc}"
        self._timeout = timeout
        self._token = _header_value(token, "token") if token is not None else None
        self._opener = build_opener(_NoRedirect())

    def request(
        self,
        path: str,
        *,
        query: Mapping[str, str | int] | None = None,
        body: Mapping[str, Any] | None = None,
        headers: Mapping[str, str] | None = None,
        max_bytes: int | None = None,
    ) -> JsonObject:
        request_headers = {"Accept": "application/json", "User-Agent": "usagemax-python"}
        request_headers.update(headers or {})
        if self._token is not None:
            request_headers["Authorization"] = f"Bearer {self._token}"
        data = None
        if body is not None:
            data = json.dumps(body, allow_nan=False, separators=(",", ":"), sort_keys=True).encode()
            if max_bytes is not None and len(data) > max_bytes:
                raise ValueError(f"JSON request exceeds the {max_bytes}-byte limit")
            request_headers["Content-Type"] = "application/json"
        url = self._origin + path
        if query:
            url += f"?{urlencode(query)}"
        request = Request(url, data=data, headers=request_headers)
        try:
            with self._opener.open(request, timeout=self._timeout) as response:
                document = json.load(response)
        except HTTPError as error:
            with error:
                try:
                    payload = json.loads(error.read(16_384))
                except (ValueError, OSError):
                    payload = None
            code = payload.get("error") if isinstance(payload, dict) else None
            if not isinstance(code, str) or not re.fullmatch(r"[a-z][a-z0-9_]{0,79}", code):
                code = None
            if code and self._token and self._token in code:
                code = None
            raise APIError(error.code, code, error.headers.get("Retry-After")) from None
        except (URLError, OSError) as error:
            raise TransportError("Could not complete the UsageMax request") from error
        except ValueError as error:
            raise TransportError("UsageMax did not return valid JSON") from error
        if not isinstance(document, dict):
            raise TransportError("UsageMax did not return a JSON object")
        return document


class UsageMax:
    """Read UsageMax health, network statistics, and opt-in public profiles."""

    def __init__(self, *, base_url: str = DEFAULT_URL, timeout: float = 15.0) -> None:
        self._http = _HTTP(base_url, timeout)

    def health(self) -> JsonObject:
        return self._http.request("/api/health")

    def stats(self) -> JsonObject:
        return self._http.request("/api/stats")

    def profile(self, handle: str) -> JsonObject:
        profile = _segment(handle.removeprefix("@"), _PROFILE_HANDLE, "profile handle")
        return self._http.request(f"/api/profiles/{profile}")

    def daily_usage(
        self, handle: str, *, days: int = 365, group_by: GroupBy | None = None,
    ) -> JsonObject:
        profile = _segment(handle.removeprefix("@"), _PROFILE_HANDLE, "profile handle")
        query: dict[str, str | int] = {"days": days}
        if group_by is not None:
            query["groupBy"] = group_by
        return self._http.request(f"/api/profiles/{profile}/daily", query=query)

    def daily_detail(
        self, handle: str, *, start: date | str, through: date | str,
        group_by: GroupBy = "model", limit: int = 100, cursor: str | None = None,
    ) -> JsonObject:
        """Return one page. Pass the returned continueCursor to fetch the next page."""
        profile = _segment(handle.removeprefix("@"), _PROFILE_HANDLE, "profile handle")
        query: dict[str, str | int] = {**_range(start, through), "groupBy": group_by, "limit": limit}
        if cursor is not None:
            query["cursor"] = cursor
        return self._http.request(f"/api/profiles/{profile}/daily/detail", query=query)


class GatewayClient:
    """Use a project-scoped gateway key to write receipts or read private reports."""

    def __init__(self, token: str, *, base_url: str = DEFAULT_URL, timeout: float = 15.0) -> None:
        self._http = _HTTP(base_url, timeout, token)

    def status(self) -> JsonObject:
        return self._http.request("/api/v1/gateway/status")

    def write_receipts(self, receipts: Sequence[Mapping[str, Any]]) -> JsonObject:
        """Send 1–50 settled receipts using an ingest key. Inspect every item result."""
        if not 1 <= len(receipts) <= 50:
            raise ValueError("A gateway batch must contain 1 to 50 receipts")
        return self._http.request(
            "/api/v1/gateway/receipts", body={"receipts": list(receipts)}, max_bytes=65_536,
        )

    def receipts(self, *, start: date | str, through: date | str, limit: int = 50) -> JsonObject:
        return self._http.request(
            "/api/v1/gateway/receipts", query={**_range(start, through), "limit": limit},
        )

    def receipt(self, request_id: str) -> JsonObject:
        request_id = _segment(request_id, _REQUEST_ID, "request ID")
        return self._http.request(f"/api/v1/gateway/receipts/{request_id}")

    def operations(self, *, start: date | str, through: date | str) -> JsonObject:
        return self._http.request("/api/v1/gateway/operations", query=_range(start, through))


class CollectorClient:
    """Send content-free usage events with an installation-bound collector key."""

    def __init__(
        self, token: str, *, device_id: str | UUID | None = None,
        base_url: str = DEFAULT_URL, timeout: float = 15.0,
    ) -> None:
        self._http = _HTTP(base_url, timeout, token)
        self._device_id = str(UUID(str(device_id))) if device_id is not None else None

    def status(self) -> JsonObject:
        headers = {"X-UsageMax-Device-ID": self._device_id} if self._device_id else None
        return self._http.request("/api/v1/devices/status", headers=headers)

    def _ingest(self, path: str, payload: Mapping[str, Any], idempotency_key: str) -> JsonObject:
        if self._device_id is None:
            raise ValueError("device_id is required for collector writes")
        return self._http.request(path, body=payload, max_bytes=1_048_576, headers={
            "X-UsageMax-Device-ID": self._device_id,
            "Idempotency-Key": _header_value(idempotency_key, "idempotency_key", 180),
        })

    def send_events(
        self, events: Sequence[Mapping[str, Any]], *, idempotency_key: str,
    ) -> JsonObject:
        """Send 1–100 native events. Keep the same key and payload when retrying."""
        if not 1 <= len(events) <= 100:
            raise ValueError("A telemetry batch must contain 1 to 100 events")
        return self._ingest("/api/v1/telemetry/llm", {"events": list(events)}, idempotency_key)

    def send_traces(self, envelope: Mapping[str, Any], *, idempotency_key: str) -> JsonObject:
        """Send an OpenTelemetry resourceSpans envelope using OTLP/HTTP JSON."""
        return self._ingest("/api/v1/traces", envelope, idempotency_key)
