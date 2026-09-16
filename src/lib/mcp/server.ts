import { fetchQuery } from "convex/nextjs";
import { api } from "../../../convex/_generated/api";
import { answerForQuery } from "@/lib/nlweb";

export const MCP_MAX_BODY_BYTES = 64 * 1024;
export const MCP_PROTOCOL_VERSION = "2025-06-18";
export const MCP_SERVER_VERSION = "1.0.0";

type RpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };
type QueryFn = (query: unknown, args: Record<string, unknown>) => Promise<unknown>;

const readOnlyAnnotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;

export const USAGEMAX_TOOLS = [
  { name: "public_profile", title: "Read public profile", description: "Read one opt-in public UsageMax profile and aggregate statistics.", inputSchema: { type: "object", properties: { handle: { type: "string", minLength: 1, maxLength: 80 } }, required: ["handle"], additionalProperties: false }, annotations: readOnlyAnnotations },
  { name: "leaderboard", title: "Read public leaderboard", description: "Read the public UsageMax leaderboard (maximum 100 rows).", inputSchema: { type: "object", properties: { metric: { type: "string", enum: ["tokens", "spend"] }, period: { type: "string", enum: ["7d", "30d", "all"] } }, additionalProperties: false }, annotations: readOnlyAnnotations },
  { name: "network_stats", title: "Read network statistics", description: "Read aggregate public UsageMax network statistics.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: readOnlyAnnotations },
  { name: "ask_site", title: "Ask UsageMax documentation", description: "Ask a bounded natural-language question about UsageMax and receive cited public resources.", inputSchema: { type: "object", properties: { query: { type: "string", minLength: 1, maxLength: 500 } }, required: ["query"], additionalProperties: false }, annotations: readOnlyAnnotations },
];

export const DOCS = {
  "overview": "UsageMax is a read-only public projection of content-free AI usage telemetry. It does not expose prompts, completions, source code, file paths, tool arguments, or secrets.",
  "public-api": "Public HTTP reads include /api/stats, /api/leaderboard, /api/profiles/{handle}, and bounded daily profile reads. Leaderboards are limited to 100 rows; daily reads are bounded.",
  "collector": "Collector ingestion is separate from this MCP surface and requires its own authenticated device contract. This MCP server never accepts telemetry writes or collector credentials.",
} as const;

export const DOC_TOOL_DEFINITIONS = [
  { name: "docs_search", title: "Search UsageMax documentation", description: "Search the bounded public UsageMax documentation index.", inputSchema: { type: "object", properties: { query: { type: "string", minLength: 1, maxLength: 200 } }, required: ["query"], additionalProperties: false }, annotations: readOnlyAnnotations },
  { name: "docs_get", title: "Read UsageMax documentation", description: "Retrieve one bounded public UsageMax documentation resource.", inputSchema: { type: "object", properties: { id: { type: "string", enum: Object.keys(DOCS) } }, required: ["id"], additionalProperties: false }, annotations: readOnlyAnnotations },
];

const error = (id: RpcRequest["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
const result = (id: RpcRequest["id"], value: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result: value });
const textResult = (id: RpcRequest["id"], value: unknown) => result(id, { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value });

export async function handleMcp(request: RpcRequest, query: QueryFn = (q, args) => fetchQuery(q as never, args as never), surface: "all" | "public" | "docs" = "all") {
  if (request.jsonrpc !== "2.0" || typeof request.method !== "string") return error(request.id, -32600, "invalid_request");
  if (request.method === "initialize") return result(request.id, { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: surface === "docs" ? "UsageMax documentation MCP" : "UsageMax public product MCP", version: MCP_SERVER_VERSION }, instructions: "Use tools/list to discover bounded read-only tools. This stateless server accepts JSON-RPC over POST only; it has no resources, prompts, actions, mutations, credentials, or SSE stream." });
  if (request.method === "tools/list") return result(request.id, { tools: surface === "docs" ? DOC_TOOL_DEFINITIONS : surface === "public" ? USAGEMAX_TOOLS : [...USAGEMAX_TOOLS, ...DOC_TOOL_DEFINITIONS] });
  if (request.method !== "tools/call") return error(request.id, -32601, "method_not_found");
  const name = request.params?.name;
  const args = request.params?.arguments;
  if (typeof name !== "string" || !args || typeof args !== "object" || Array.isArray(args)) return error(request.id, -32602, "invalid_tool_arguments");
  const toolArgs = args as Record<string, unknown>;
  if ((surface === "public" && (name === "docs_get" || name === "docs_search")) || (surface === "docs" && !["docs_get", "docs_search"].includes(name))) return error(request.id, -32601, "tool_not_found");
  if (name === "network_stats") return textResult(request.id, { stats: await query(api.public.network, {}) });
  if (name === "ask_site") {
    if (typeof toolArgs.query !== "string" || toolArgs.query.trim().length < 1 || toolArgs.query.length > 500) return error(request.id, -32602, "invalid_query");
    return textResult(request.id, answerForQuery(toolArgs.query));
  }
  if (name === "leaderboard") {
    const metric = toolArgs.metric === undefined ? "tokens" : toolArgs.metric;
    const period = toolArgs.period === undefined ? "all" : toolArgs.period;
    if ((metric !== "tokens" && metric !== "spend") || (period !== "7d" && period !== "30d" && period !== "all")) return error(request.id, -32602, "invalid_metric_or_period");
    return textResult(request.id, { metric, period, leaderboard: await query(api.public.leaderboard, { metric, period, limit: 100 }) });
  }
  if (name === "public_profile") {
    if (typeof toolArgs.handle !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(toolArgs.handle)) return error(request.id, -32602, "invalid_handle");
    const profile = await query(api.public.profile, { handle: toolArgs.handle });
    return profile ? textResult(request.id, { profile }) : error(request.id, -32004, "profile_not_found");
  }
  if (name === "docs_get") {
    const id = toolArgs.id;
    if (typeof id !== "string" || !(id in DOCS)) return error(request.id, -32004, "resource_not_found");
    return textResult(request.id, { id, text: DOCS[id as keyof typeof DOCS] });
  }
  if (name === "docs_search") {
    if (typeof toolArgs.query !== "string" || toolArgs.query.length < 1 || toolArgs.query.length > 200) return error(request.id, -32602, "invalid_query");
    const needle = toolArgs.query.toLowerCase();
    return textResult(request.id, { matches: Object.entries(DOCS).filter(([id, text]) => `${id} ${text}`.toLowerCase().includes(needle)).map(([id]) => id) });
  }
  return error(request.id, -32601, "tool_not_found");
}
