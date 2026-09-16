import { apiError, apiResponse } from "@/lib/api-response";

export const dynamic = "force-dynamic";
const MAX_BYTES = 16_384;
const eventKeys = new Set(["eventKey", "model", "occurredAt", "eventType", "totalTokens", "costMicros"]);

export async function POST(request: Request) {
  if (!(request.headers.get("content-type")?.toLowerCase() ?? "").includes("application/json")) return apiError("content_type_must_be_application_json", 415);
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_BYTES) return apiError("payload_too_large", 413);
  let value: unknown;
  try { value = JSON.parse(new TextDecoder().decode(body)); } catch { return apiError("invalid_sandbox_input", 400); }
  if (!value || typeof value !== "object" || Array.isArray(value)) return apiError("invalid_sandbox_input", 400);
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== "events") || !Array.isArray(input.events) || input.events.length < 1 || input.events.length > 100) return apiError("invalid_sandbox_input", 400);
  for (const event of input.events) {
    if (!event || typeof event !== "object" || Array.isArray(event)) return apiError("invalid_sandbox_input", 400);
    const record = event as Record<string, unknown>;
    if (Object.keys(record).some((key) => !eventKeys.has(key)) || typeof record.eventKey !== "string" || record.eventKey.length < 1 || record.eventKey.length > 180 || typeof record.model !== "string" || record.model.length < 1 || record.model.length > 120 || !(typeof record.occurredAt === "string" || Number.isInteger(record.occurredAt))) return apiError("invalid_sandbox_input", 400);
  }
  return apiResponse({ ok: true, accepted: input.events.length, writes: false, message: "Input is valid for the content-free telemetry batch contract." });
}
