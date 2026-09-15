export const DAY_MS = 86_400_000;
export const MIN_EVENT_TIME = Date.UTC(2024, 0, 1);

export function dayFromTimestamp(value: number) {
  return new Date(value).toISOString().slice(0, 10);
}

export function isValidHistoricalDay(day: string, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const timestamp = Date.parse(`${day}T00:00:00.000Z`);
  return Number.isFinite(timestamp)
    && new Date(timestamp).toISOString().slice(0, 10) === day
    && timestamp >= MIN_EVENT_TIME
    && timestamp <= now + DAY_MS;
}

export function trailingDayCutoff(now: number, dayCount: number) {
  return dayFromTimestamp(now - (Math.max(1, Math.floor(dayCount)) - 1) * DAY_MS);
}

export function clampNonNegative(value: unknown, maximum = Number.MAX_SAFE_INTEGER) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(maximum, Math.max(0, Math.round(value)));
}

export function cleanText(value: unknown, fallback: string, maximumLength = 120) {
  if (typeof value !== "string") return fallback;
  const cleaned = value.trim().replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, maximumLength);
  return cleaned || fallback;
}

export async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function jsonResponse(body: unknown, status = 200, extraHeaders?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "x-request-id": crypto.randomUUID(),
      ...extraHeaders,
    },
  });
}
