import { handleMcp, MCP_MAX_BODY_BYTES, MCP_PROTOCOL_VERSION } from "@/lib/mcp/server";

const allowedOrigin = (origin: string | null) => origin === null
  || origin === "https://usagemax.com"
  || (process.env.NODE_ENV !== "production" && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));

const httpError = (error: string, status: number, message: string, hint: string) => Response.json(
  { error, message, hint },
  { status, headers: { "cache-control": "no-store", allow: "POST, GET", vary: "Origin" } },
);

export async function handlePost(request: Request, surface: "public" | "docs") {
  if (!allowedOrigin(request.headers.get("origin"))) return httpError("origin_not_allowed", 403, "The MCP Origin is not allowed.", "Use the UsageMax origin or omit Origin for a non-browser client.");
  const protocolVersion = request.headers.get("mcp-protocol-version");
  if (protocolVersion && protocolVersion !== MCP_PROTOCOL_VERSION) return httpError("unsupported_protocol_version", 400, "The MCP protocol version is not supported.", `Use MCP-Protocol-Version: ${MCP_PROTOCOL_VERSION}.`);
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return httpError("content_type_must_be_application_json", 415, "The MCP request body must be JSON.", "Set Content-Type: application/json.");
  const accept = request.headers.get("accept") ?? "*/*";
  if (!accept.includes("*/*") && !accept.includes("application/json") && !accept.includes("text/event-stream")) return httpError("not_acceptable", 406, "The MCP client did not advertise a supported response type.", "Include application/json and text/event-stream in Accept.");
  const length = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(length) || length < 0 || length > MCP_MAX_BODY_BYTES) return httpError("payload_too_large", 413, "The MCP request body is too large.", "Keep the JSON-RPC request below 64 KiB.");
  let body: unknown;
  try {
    const raw = await request.arrayBuffer();
    if (raw.byteLength > MCP_MAX_BODY_BYTES) return httpError("payload_too_large", 413, "The MCP request body is too large.", "Keep the JSON-RPC request below 64 KiB.");
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return httpError("invalid_json", 400, "The MCP request body is not valid JSON.", "Send one UTF-8 JSON-RPC object per POST.");
  }
  const rpc = body as { method?: string };
  if (rpc.method === "notifications/initialized" || rpc.method === "notifications/cancelled") return new Response(null, { status: 202, headers: { "cache-control": "no-store", allow: "POST, GET", vary: "Origin" } });
  const response = await handleMcp(body as never, undefined, surface);
  return Response.json(response, { headers: { "cache-control": "no-store", vary: "Origin", allow: "POST, GET" } });
}

export function getMcp() {
  return httpError("GET_not_supported_use_POST", 405, "This stateless MCP server does not open an SSE stream.", "Send JSON-RPC requests with POST and Accept: application/json, text/event-stream.");
}
