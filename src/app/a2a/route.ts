import { answerForQuery } from "@/lib/nlweb";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 32 * 1024;
const MAX_QUERY_LENGTH = 500;
const A2A_VERSION = "1.0";

type JsonRpcRequest = {
  jsonrpc?: unknown;
  id?: string | number | null;
  method?: unknown;
  params?: unknown;
};

const responseHeaders = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "a2a-version": A2A_VERSION,
};

function rpcError(id: JsonRpcRequest["id"], code: number, message: string) {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status: 200, headers: responseHeaders });
}

function messageText(params: unknown) {
  if (!params || typeof params !== "object" || Array.isArray(params)) return "";
  const message = (params as { message?: unknown }).message;
  if (!message || typeof message !== "object" || Array.isArray(message)) return "";
  const parts = (message as { parts?: unknown }).parts;
  if (!Array.isArray(parts) || parts.length < 1 || parts.length > 8) return "";
  const text = parts.map((part) => {
    if (!part || typeof part !== "object" || Array.isArray(part) || typeof (part as { text?: unknown }).text !== "string") return "";
    return (part as { text: string }).text;
  }).join(" ").trim();
  return text.length > 0 && text.length <= MAX_QUERY_LENGTH ? text : "";
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json") && !contentType.includes("application/a2a+json")) {
    return rpcError(null, -32600, "content_type_must_be_application_json");
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declaredLength) || declaredLength < 0 || declaredLength > MAX_BODY_BYTES) {
    return rpcError(null, -32600, "payload_too_large");
  }
  let body: JsonRpcRequest;
  try {
    const raw = await request.arrayBuffer();
    if (raw.byteLength > MAX_BODY_BYTES) return rpcError(null, -32600, "payload_too_large");
    const parsed = JSON.parse(new TextDecoder().decode(raw));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return rpcError(null, -32600, "invalid_request");
    body = parsed as JsonRpcRequest;
  } catch {
    return rpcError(null, -32700, "parse_error");
  }
  if (body.jsonrpc !== "2.0" || typeof body.method !== "string") return rpcError(body.id, -32600, "invalid_request");
  if (body.method !== "SendMessage" && body.method !== "message/send") return rpcError(body.id, -32601, "method_not_found");
  const query = messageText(body.params);
  if (!query) return rpcError(body.id, -32602, "invalid_params");

  const answer = answerForQuery(query);
  return Response.json({
    jsonrpc: "2.0",
    id: body.id ?? null,
    result: {
      message: {
        messageId: crypto.randomUUID(),
        role: "ROLE_AGENT",
        parts: [{ text: answer.answer }],
        metadata: { sources: answer.sources, results: answer.results },
      },
    },
  }, { headers: responseHeaders });
}

export function GET() {
  return Response.json({
    name: "UsageMax public observability agent",
    endpoint: "https://usagemax.com/a2a",
    protocol: "JSON-RPC 2.0",
    version: A2A_VERSION,
    capabilities: { streaming: false, pushNotifications: false, tasks: false },
    limitations: ["read-only", "public bounded projections only", "no credentials", "no task persistence", "32 KiB request limit"],
  }, { headers: { ...responseHeaders, "cache-control": "public, max-age=300" } });
}
