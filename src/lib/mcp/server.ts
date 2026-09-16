import { fetchQuery } from "convex/nextjs";
import { api } from "../../../convex/_generated/api";
import { answerForQuery } from "@/lib/nlweb";

export const MCP_MAX_BODY_BYTES = 64 * 1024;
export const MCP_PROTOCOL_VERSION = "2025-06-18";
export const MCP_SERVER_VERSION = "1.0.0";
export const MCP_SERVER_NAMES = {
  public: "UsageMax public product MCP",
  docs: "UsageMax documentation MCP",
} as const;
export const MCP_SERVER_BRANDING = { websiteUrl: "https://usagemax.com", icon: "https://usagemax.com/brand/icon-192.png" } as const;
export const MCP_APP_RESOURCE_URI = "ui://usagemax/public-observability.html";
export const MCP_APP_RESOURCE_MIME = "text/html;profile=mcp-app";
const MCP_APP_UI_META = {
  ui: {
    prefersBorder: false,
    csp: { baseUriDomains: [], connectDomains: ["https://usagemax.com"], frameDomains: [], resourceDomains: [] },
  },
} as const;

type RpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };
type QueryFn = (query: unknown, args: Record<string, unknown>) => Promise<unknown>;

const readOnlyAnnotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;

export const USAGEMAX_TOOLS = [
  { name: "public_profile", title: "Read public profile", description: "Read one opt-in public UsageMax profile and aggregate statistics.", inputSchema: { type: "object", properties: { handle: { type: "string", minLength: 1, maxLength: 80 } }, required: ["handle"], additionalProperties: false }, annotations: readOnlyAnnotations },
  { name: "leaderboard", title: "Read public leaderboard", description: "Read the public UsageMax leaderboard (maximum 100 rows).", inputSchema: { type: "object", properties: { metric: { type: "string", enum: ["tokens", "spend"], default: "tokens" }, period: { type: "string", enum: ["7d", "30d", "all"], default: "all" } }, additionalProperties: false }, annotations: readOnlyAnnotations },
  { name: "network_stats", title: "Read network statistics", description: "Read aggregate public UsageMax network statistics and render the optional inline observability view.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: readOnlyAnnotations, _meta: { ui: { resourceUri: MCP_APP_RESOURCE_URI } } },
  { name: "ask_site", title: "Ask UsageMax documentation", description: "Ask a bounded natural-language question about UsageMax and receive cited public resources.", inputSchema: { type: "object", properties: { query: { type: "string", minLength: 1, maxLength: 500 } }, required: ["query"], additionalProperties: false }, annotations: readOnlyAnnotations },
];

export const MCP_APP_RESOURCES = [
  {
    uri: MCP_APP_RESOURCE_URI,
    name: "UsageMax public observability view",
    title: "UsageMax public observability",
    description: "A small, sandboxed, read-only view for the network statistics tool.",
    mimeType: MCP_APP_RESOURCE_MIME,
    _meta: MCP_APP_UI_META,
  },
] as const;

const MCP_APP_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors https://chatgpt.com https://claude.ai; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src https://usagemax.com; img-src 'none'; font-src 'none'; media-src 'none'; object-src 'none';">
    <title>UsageMax public observability</title>
    <style>
      :root { color-scheme: light dark; font: 14px/1.4 ui-sans-serif, system-ui, sans-serif; }
      body { margin: 0; padding: 18px; color: #20201e; background: #f7f3eb; }
      @media (prefers-color-scheme: dark) { body { color: #f5efe6; background: #1b1917; } }
      header { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
      h1 { margin: 0; font-size: 18px; letter-spacing: -.02em; }
      .status { color: #b74316; font-size: 12px; font-weight: 650; }
      .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
      .metric { min-height: 66px; padding: 12px; border: 1px solid color-mix(in srgb, currentColor 18%, transparent); border-radius: 12px; }
      .label { display: block; margin-bottom: 6px; color: color-mix(in srgb, currentColor 65%, transparent); font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
      .value { font-size: 22px; font-variant-numeric: tabular-nums; font-weight: 700; }
      .empty { margin: 18px 0 0; color: color-mix(in srgb, currentColor 68%, transparent); }
    </style>
  </head>
  <body>
    <header><h1>UsageMax</h1><span class="status" id="status">waiting for a public read</span></header>
    <section class="grid" aria-label="UsageMax network statistics">
      <div class="metric"><span class="label">Tokens</span><strong class="value" id="tokens">—</strong></div>
      <div class="metric"><span class="label">Profiles</span><strong class="value" id="profiles">—</strong></div>
      <div class="metric"><span class="label">Events today</span><strong class="value" id="events">—</strong></div>
    </section>
    <p class="empty" id="message">Call the network statistics tool to populate this view.</p>
    <script>
      (function () {
        var number = new Intl.NumberFormat();
        function text(id, value) { document.getElementById(id).textContent = typeof value === 'number' ? number.format(value) : '—'; }
        function render(value) {
          var stats = value && value.stats ? value.stats : value;
          if (!stats || typeof stats !== 'object') return;
          text('tokens', stats.totalTokens);
          text('profiles', stats.profiles);
          text('events', stats.eventsToday);
          document.getElementById('status').textContent = 'live public projection';
          document.getElementById('message').textContent = 'Read-only data. No credentials or private workspace state is available to this view.';
        }
        window.addEventListener('message', function (event) {
          var message = event && event.data;
          var value = message && message.params && (message.params.structuredContent || message.params.content);
          if (Array.isArray(value) && value[0] && value[0].text) { try { value = JSON.parse(value[0].text); } catch (_) {} }
          render(value);
        });
      }());
    </script>
  </body>
</html>`;

export const DOCS = {
  "overview": "UsageMax is a read-only public projection of content-free AI usage telemetry. It does not expose prompts, completions, source code, file paths, tool arguments, or secrets.",
  "public-api": "Public HTTP reads include /api/stats, /api/leaderboard, /api/profiles/{handle}, and bounded daily profile reads. Leaderboards are limited to 100 rows; daily reads are bounded.",
  "collector": "Collector ingestion is separate from this MCP surface and requires its own authenticated device contract. This MCP server never accepts telemetry writes or collector credentials.",
} as const;

const DOC_RESOURCE_METADATA = {
  overview: { title: "UsageMax overview", uri: "https://usagemax.com/about.md" },
  "public-api": { title: "UsageMax public API", uri: "https://usagemax.com/api/llms.txt.md" },
  collector: { title: "UsageMax collector boundary", uri: "https://usagemax.com/auth.md" },
} as const;

export const DOC_TOOL_DEFINITIONS = [
  { name: "docs_list", title: "List UsageMax documentation", description: "List the bounded public UsageMax documentation resources available to this MCP server.", inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 3, default: 3, description: "Maximum number of documentation resources to return." } }, required: [], additionalProperties: false }, annotations: readOnlyAnnotations },
  { name: "docs_search", title: "Search UsageMax documentation", description: "Search the bounded public UsageMax documentation index.", inputSchema: { type: "object", properties: { query: { type: "string", minLength: 1, maxLength: 200 } }, required: ["query"], additionalProperties: false }, annotations: readOnlyAnnotations },
  { name: "docs_get", title: "Read UsageMax documentation", description: "Retrieve one bounded public UsageMax documentation resource.", inputSchema: { type: "object", properties: { id: { type: "string", enum: Object.keys(DOCS) } }, required: ["id"], additionalProperties: false }, annotations: readOnlyAnnotations },
];

const instructionsFor = (surface: "all" | "public" | "docs") => surface === "docs"
  ? "Use tools/list to discover bounded read-only documentation tools. This stateless server accepts JSON-RPC over POST only; it has no product actions, mutations, credentials, resources, or SSE stream."
  : surface === "public"
    ? "Use tools/list to discover bounded read-only public product tools. This stateless server accepts JSON-RPC over POST only; it has no mutations, credentials, prompts, or SSE stream. The network statistics tool offers one optional read-only MCP App resource."
    : "Use tools/list to discover bounded read-only public product and documentation tools. This stateless server accepts JSON-RPC over POST only; it has no mutations, credentials, prompts, or SSE stream. The product surface offers one optional read-only MCP App resource.";

export const MCP_SERVER_INSTRUCTIONS = {
  public: instructionsFor("public"),
  docs: instructionsFor("docs"),
} as const;

const error = (id: RpcRequest["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
const result = (id: RpcRequest["id"], value: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result: value });
const textResult = (id: RpcRequest["id"], value: unknown) => result(id, { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value });

export async function handleMcp(request: RpcRequest, query: QueryFn = (q, args) => fetchQuery(q as never, args as never), surface: "all" | "public" | "docs" = "all") {
  if (request.jsonrpc !== "2.0" || typeof request.method !== "string") return error(request.id, -32600, "invalid_request");
  if (request.method === "initialize") return result(request.id, { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: { tools: {}, ...(surface === "docs" ? {} : { resources: { listChanged: false, subscribe: false } }) }, serverInfo: { name: surface === "docs" ? MCP_SERVER_NAMES.docs : MCP_SERVER_NAMES.public, version: MCP_SERVER_VERSION }, instructions: surface === "docs" ? MCP_SERVER_INSTRUCTIONS.docs : MCP_SERVER_INSTRUCTIONS.public });
  if (request.method === "tools/list") return result(request.id, { tools: surface === "docs" ? DOC_TOOL_DEFINITIONS : surface === "public" ? USAGEMAX_TOOLS : [...USAGEMAX_TOOLS, ...DOC_TOOL_DEFINITIONS] });
  if (request.method === "resources/list") return result(request.id, { resources: surface === "docs" ? [] : MCP_APP_RESOURCES });
  if (request.method === "resources/read") {
    const uri = request.params?.uri;
    if (surface === "docs" || uri !== MCP_APP_RESOURCE_URI) return error(request.id, -32004, "resource_not_found");
    return result(request.id, { contents: [{ uri: MCP_APP_RESOURCE_URI, mimeType: MCP_APP_RESOURCE_MIME, text: MCP_APP_HTML, _meta: MCP_APP_UI_META }] });
  }
  if (request.method !== "tools/call") return error(request.id, -32601, "method_not_found");
  const name = request.params?.name;
  const args = request.params?.arguments;
  if (typeof name !== "string" || !args || typeof args !== "object" || Array.isArray(args)) return error(request.id, -32602, "invalid_tool_arguments");
  const toolArgs = args as Record<string, unknown>;
  if ((surface === "public" && DOC_TOOL_DEFINITIONS.some((tool) => tool.name === name)) || (surface === "docs" && !DOC_TOOL_DEFINITIONS.some((tool) => tool.name === name))) return error(request.id, -32601, "tool_not_found");
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
  if (name === "docs_list") {
    const limit = toolArgs.limit === undefined ? 3 : toolArgs.limit;
    if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 3) return error(request.id, -32602, "invalid_limit");
    return textResult(request.id, { resources: Object.entries(DOC_RESOURCE_METADATA).slice(0, limit).map(([id, metadata]) => ({ id, ...metadata })) });
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
