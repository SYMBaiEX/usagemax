"use client";

import { useEffect } from "react";

type ToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: Record<string, unknown>, options: ToolExecutionOptions) => Promise<unknown>;
  annotations: { readOnlyHint: true; untrustedContentHint: true; consequentialHint: false };
};

type ToolExecutionOptions = { signal: AbortSignal };

export type ModelContext = {
  registerTool?: (tool: ToolDefinition, options?: { signal?: AbortSignal }) => Promise<void> | void;
  unregisterTool?: (name: string) => void;
};

declare global {
  interface Document { modelContext?: ModelContext; }
  interface Navigator { modelContext?: ModelContext; }
}

export function detectWebMcpContext(documentContext: ModelContext | undefined, navigatorContext: ModelContext | undefined) {
  return typeof documentContext?.registerTool === "function"
    ? { context: documentContext, source: "document" as const }
    : typeof navigatorContext?.registerTool === "function"
      ? { context: navigatorContext, source: "navigator" as const }
      : undefined;
}

async function readPublicJson(path: string, signal: AbortSignal) {
  const response = await fetch(path, { cache: "no-store", credentials: "omit", headers: { accept: "application/json" }, signal });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === "object" && "message" in body ? String(body.message) : `UsageMax returned HTTP ${response.status}.`;
    throw new Error(message);
  }
  return body;
}

export const tools: ToolDefinition[] = [
  {
    name: "usagemax_network_stats",
    title: "Read network statistics",
    description: "Read bounded public aggregate UsageMax network statistics.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true, consequentialHint: false },
    execute: async (_input, { signal }) => readPublicJson("/api/stats", signal),
  },
  {
    name: "usagemax_leaderboard",
    title: "Read the leaderboard",
    description: "Read the public UsageMax leaderboard for a bounded window and metric.",
    inputSchema: {
      type: "object",
      properties: {
        metric: { type: "string", enum: ["tokens", "spend"], default: "tokens" },
        window: { type: "string", enum: ["7d", "30d", "all"], default: "all" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true, consequentialHint: false },
    execute: async (input, { signal }) => {
      const metric = input.metric === "spend" ? "spend" : "tokens";
      const window = input.window === "7d" || input.window === "30d" ? input.window : "all";
      return readPublicJson(`/api/leaderboard?metric=${metric}&window=${window}`, signal);
    },
  },
  {
    name: "usagemax_public_profile",
    title: "Read a public profile",
    description: "Read one opt-in public UsageMax profile by handle.",
    inputSchema: {
      type: "object",
      required: ["handle"],
      properties: { handle: { type: "string", minLength: 1, maxLength: 80 } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true, consequentialHint: false },
    execute: async (input, { signal }) => {
      const handle = typeof input.handle === "string" ? input.handle.trim() : "";
      if (!/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(handle)) throw new Error("Use a valid public UsageMax handle.");
      return readPublicJson(`/api/profiles/${encodeURIComponent(handle)}`, signal);
    },
  },
  {
    name: "usagemax_ask",
    title: "Ask UsageMax",
    description: "Ask a bounded question about public UsageMax documentation and receive cited resources.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: { query: { type: "string", minLength: 1, maxLength: 500 } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true, consequentialHint: false },
    execute: async (input, { signal }) => {
      const query = typeof input.query === "string" ? input.query.trim() : "";
      if (!query || query.length > 500) throw new Error("Use a question with 1–500 characters.");
      return readPublicJson(`/ask?query=${encodeURIComponent(query)}`, signal);
    },
  },
];

/**
 * Register the normative WebMCP surface. The explicit document.modelContext
 * call is intentional: document is the current standards path, while the
 * navigator path below is retained only for older previews.
 */
export async function registerDocumentWebMcpTools(signal: AbortSignal): Promise<number> {
  if (signal.aborted || !document.modelContext || typeof document.modelContext.registerTool !== "function") return 0;

  let registered = 0;
  for (const tool of tools) {
    if (signal.aborted) break;
    try {
      await document.modelContext.registerTool(tool, { signal });
      registered += 1;
    } catch {
      // A browser may reject a duplicate or a not-yet-enabled origin trial;
      // one tool failing must not affect the rest of the page.
    }
  }
  return registered;
}

export async function registerNavigatorWebMcpTools(context: ModelContext, signal: AbortSignal): Promise<number> {
  if (signal.aborted || typeof context.registerTool !== "function") return 0;

  let registered = 0;
  for (const tool of tools) {
    if (signal.aborted) break;
    try {
      await context.registerTool(tool, { signal });
      registered += 1;
    } catch {
      // Ignore unsupported preview behavior.
    }
  }
  return registered;
}

export function WebMcpTools() {
  useEffect(() => {
    // Providers mounts this component for every route, while the public
    // landing surface mounts it as well so crawlers and WebMCP-capable
    // browsers see the normative registration in the page bundle. Share one
    // owner across both mounts to avoid duplicate tool registration.
    type RuntimeState = { refs: number; owner: symbol };
    const runtime = globalThis as typeof globalThis & { __usagemaxWebMcpState?: RuntimeState };
    const state = runtime.__usagemaxWebMcpState ?? { refs: 0, owner: Symbol("usagemax-webmcp-owner") };
    state.refs += 1;
    runtime.__usagemaxWebMcpState = state;
    if (state.refs > 1) return () => {
      state.refs -= 1;
      if (state.refs === 0) delete runtime.__usagemaxWebMcpState;
    };

    const controller = new AbortController();
    let disposed = false;
    let registrationStarted = false;
    let retryIndex = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let legacyContext: ModelContext | undefined;
    const retryDelays = [50, 250, 750, 1_500, 3_000] as const;

    // WebMCP is a progressive enhancement. A bounded retry window handles a
    // browser that injects modelContext just after hydration without leaving
    // an interval or background work resident on unsupported browsers.
    const attemptRegistration = () => {
      if (disposed || registrationStarted || controller.signal.aborted) return;
      const detected = detectWebMcpContext(document.modelContext, navigator.modelContext);

      if (detected?.source === "document") {
        registrationStarted = true;
        void registerDocumentWebMcpTools(controller.signal).catch(() => undefined);
        return;
      }

      if (detected?.source === "navigator") {
        registrationStarted = true;
        legacyContext = detected.context;
        void registerNavigatorWebMcpTools(detected.context, controller.signal).catch(() => undefined);
        return;
      }

      const delay = retryDelays[retryIndex];
      if (delay === undefined) return;
      retryIndex += 1;
      timer = setTimeout(attemptRegistration, delay);
    };

    attemptRegistration();

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      controller.abort();
      if (legacyContext?.unregisterTool) for (const tool of tools) legacyContext.unregisterTool(tool.name);
      state.refs -= 1;
      if (state.refs === 0 && runtime.__usagemaxWebMcpState?.owner === state.owner) delete runtime.__usagemaxWebMcpState;
    };
  }, []);

  return null;
}
