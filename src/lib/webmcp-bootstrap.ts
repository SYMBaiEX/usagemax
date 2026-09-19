// A small standards-path bootstrap is emitted in the initial document so a
// WebMCP-capable browser can discover tools before the client bundle hydrates.
// The hydrated component remains the richer fallback and shares the claim bit.
export const webmcpBootstrap = String.raw`(function () {
  var runtime = window;
  if (runtime.__usagemaxWebMcpClaimed) return;
  var retry = 0;
  var delays = [50, 250, 750, 1500, 3000];
  var read = function (path, signal) {
    return fetch(path, { cache: "no-store", credentials: "omit", headers: { accept: "application/json" }, signal: signal }).then(function (response) {
      return response.json().catch(function () { return null; }).then(function (body) {
        if (!response.ok) throw new Error(body && body.message ? String(body.message) : "UsageMax returned HTTP " + response.status + ".");
        return body;
      });
    });
  };
  var tools = [
    { name: "usagemax_network_stats", title: "Read network statistics", description: "Read bounded public aggregate UsageMax network statistics.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: function (_, options) { return read("/api/stats", options.signal); } },
    { name: "usagemax_leaderboard", title: "Read the leaderboard", description: "Read the public UsageMax leaderboard for a bounded window and metric.", inputSchema: { type: "object", properties: { metric: { type: "string", enum: ["tokens", "spend"] }, window: { type: "string", enum: ["7d", "30d", "all"] } }, additionalProperties: false }, execute: function (input, options) { var metric = input && input.metric === "spend" ? "spend" : "tokens"; var window = input && (input.window === "7d" || input.window === "30d") ? input.window : "all"; return read("/api/leaderboard?metric=" + metric + "&window=" + window, options.signal); } },
    { name: "usagemax_public_profile", title: "Read a public profile", description: "Read one opt-in public UsageMax profile by handle.", inputSchema: { type: "object", required: ["handle"], properties: { handle: { type: "string", minLength: 1, maxLength: 80 } }, additionalProperties: false }, execute: function (input, options) { var handle = input && typeof input.handle === "string" ? input.handle.trim() : ""; if (!/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(handle)) throw new Error("Use a valid public UsageMax handle."); return read("/api/profiles/" + encodeURIComponent(handle), options.signal); } },
    { name: "usagemax_ask", title: "Ask UsageMax", description: "Ask a bounded question about public UsageMax documentation and receive cited resources.", inputSchema: { type: "object", required: ["query"], properties: { query: { type: "string", minLength: 1, maxLength: 500 } }, additionalProperties: false }, execute: function (input, options) { var query = input && typeof input.query === "string" ? input.query.trim() : ""; if (!query || query.length > 500) throw new Error("Use a question with 1–500 characters."); return read("/ask?query=" + encodeURIComponent(query), options.signal); } }
  ];
  function register() {
    if (runtime.__usagemaxWebMcpClaimed) return;
    var documentContext = document.modelContext;
    var navigatorContext = navigator.modelContext;
    var context = documentContext && typeof documentContext.registerTool === "function" ? documentContext : navigatorContext && typeof navigatorContext.registerTool === "function" ? navigatorContext : null;
    if (!context) {
      if (retry < delays.length) setTimeout(register, delays[retry++]);
      return;
    }
    runtime.__usagemaxWebMcpClaimed = true;
    var controller = new AbortController();
    runtime.__usagemaxWebMcpController = controller;
    tools.reduce(function (chain, tool) {
      return chain.then(function () {
        if (controller.signal.aborted) return undefined;
        return documentContext === context
          ? document.modelContext.registerTool(tool, { signal: controller.signal })
          : context.registerTool(tool, { signal: controller.signal });
      });
    }, Promise.resolve()).catch(function () { return undefined; });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", register, { once: true });
  else register();
}());`;
