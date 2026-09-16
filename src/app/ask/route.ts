import { answerForQuery, failureForQuery, NLWEB_VERSION } from "@/lib/nlweb";

export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 32 * 1024;

function queryFromValue(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && !Array.isArray(value) && "text" in value && typeof value.text === "string") return value.text.trim();
  return "";
}

function wantsStreaming(value: unknown) {
  return value === true || value === "true";
}

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      link: "</ask>; rel=\"nlweb\", </index.md>; rel=\"alternate\"; type=\"text/markdown\"",
      vary: "Accept",
    },
  });
}

function streamResponse(result: ReturnType<typeof answerForQuery>) {
  const encoder = new TextEncoder();
  const events = [
    ["start", { query_id: result.query_id, _meta: { response_type: "answer", version: NLWEB_VERSION } }],
    ...result.results.map((item) => ["result", item] as const),
    ["complete", result],
  ] as const;
  const stream = new ReadableStream({
    start(controller) {
      for (const [event, data] of events) controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "cache-control": "no-cache, no-store",
      "content-type": "text/event-stream; charset=utf-8",
      connection: "keep-alive",
      link: "</ask>; rel=\"nlweb\"",
      "x-accel-buffering": "no",
    },
  });
}

function run(query: string, streaming: boolean, queryId?: string) {
  if (!query) return jsonResponse(failureForQuery("missing_query", "Provide a natural-language query in query or query.text."), 400);
  if (query.length > 500) return jsonResponse(failureForQuery("query_too_long", "Keep the query below 500 characters."), 413);
  const result = answerForQuery(query, queryId && /^[a-zA-Z0-9._:-]{1,120}$/.test(queryId) ? queryId : undefined);
  return streaming ? streamResponse(result) : jsonResponse(result);
}

export function GET(request: Request) {
  const url = new URL(request.url);
  return run(url.searchParams.get("query") ?? "", wantsStreaming(url.searchParams.get("streaming")), url.searchParams.get("query_id") ?? undefined);
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) return jsonResponse(failureForQuery("content_type_must_be_application_json", "The NLWeb request body must be JSON."), 415);
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declaredLength) || declaredLength < 0 || declaredLength > MAX_BODY_BYTES) return jsonResponse(failureForQuery("payload_too_large", "The NLWeb request body exceeds 32 KiB."), 413);
  let body: unknown;
  try {
    const raw = await request.arrayBuffer();
    if (raw.byteLength > MAX_BODY_BYTES) return jsonResponse(failureForQuery("payload_too_large", "The NLWeb request body exceeds 32 KiB."), 413);
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return jsonResponse(failureForQuery("invalid_json", "Send one JSON object with a query field."), 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonResponse(failureForQuery("invalid_request", "Send one JSON object with a query field."), 400);
  const input = body as { query?: unknown; streaming?: unknown; prefer?: { streaming?: unknown }; query_id?: unknown };
  const queryId = typeof input.query_id === "string" ? input.query_id : undefined;
  const streaming = wantsStreaming(input.streaming) || wantsStreaming(input.prefer?.streaming);
  return run(queryFromValue(input.query), streaming, queryId);
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { allow: "GET, POST, OPTIONS", "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" } });
}
