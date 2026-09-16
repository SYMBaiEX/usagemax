"use client";

import { useEffect } from "react";

type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<unknown>;
  annotations: { readOnlyHint: true; destructiveHint: false; openWorldHint: false };
};

type ModelContext = {
  registerTool?: (tool: ToolDefinition, options?: { signal?: AbortSignal }) => Promise<void> | void;
  unregisterTool?: (name: string) => void;
};

declare global {
  interface Document { modelContext?: ModelContext; }
  interface Navigator { modelContext?: ModelContext; }
}

export function detectWebMcpContext(documentContext: ModelContext | undefined, navigatorContext: ModelContext | undefined) {
  return documentContext?.registerTool ? { context: documentContext, source: "document" as const } : navigatorContext?.registerTool ? { context: navigatorContext, source: "navigator" as const } : undefined;
}

async function readPublicJson(path: string) {
  const response = await fetch(path, { cache: "no-store", credentials: "omit", headers: { accept: "application/json" } });
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
    description: "Read bounded public aggregate UsageMax network statistics.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    execute: async () => readPublicJson("/api/stats"),
  },
  {
    name: "usagemax_leaderboard",
    description: "Read the public UsageMax leaderboard for a bounded window and metric.",
    inputSchema: {
      type: "object",
      properties: {
        metric: { type: "string", enum: ["tokens", "spend"], default: "tokens" },
        window: { type: "string", enum: ["7d", "30d", "all"], default: "all" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    execute: async (input) => {
      const metric = input.metric === "spend" ? "spend" : "tokens";
      const window = input.window === "7d" || input.window === "30d" ? input.window : "all";
      return readPublicJson(`/api/leaderboard?metric=${metric}&window=${window}`);
    },
  },
  {
    name: "usagemax_public_profile",
    description: "Read one opt-in public UsageMax profile by handle.",
    inputSchema: {
      type: "object",
      required: ["handle"],
      properties: { handle: { type: "string", minLength: 1, maxLength: 80 } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    execute: async (input) => {
      const handle = typeof input.handle === "string" ? input.handle.trim() : "";
      if (!/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(handle)) throw new Error("Use a valid public UsageMax handle.");
      return readPublicJson(`/api/profiles/${encodeURIComponent(handle)}`);
    },
  },
  {
    name: "usagemax_ask",
    description: "Ask a bounded question about public UsageMax documentation and receive cited resources.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: { query: { type: "string", minLength: 1, maxLength: 500 } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    execute: async (input) => {
      const query = typeof input.query === "string" ? input.query.trim() : "";
      if (!query || query.length > 500) throw new Error("Use a question with 1–500 characters.");
      return readPublicJson(`/ask?query=${encodeURIComponent(query)}`);
    },
  },
];

export function WebMcpTools() {
  useEffect(() => {
    // WebMCP is a progressive enhancement. Unsupported browsers pay only for
    // this feature-detection branch and keep the normal UI unchanged.
    const controller = new AbortController();
    const detected = detectWebMcpContext(document.modelContext, navigator.modelContext);
    if (detected?.source === "document") {
      for (const tool of tools) {
        try {
          // Keep the normative WebMCP call explicit. The browser API is
          // document.modelContext.registerTool(), with AbortSignal lifecycle.
          void Promise.resolve(document.modelContext?.registerTool?.(tool, { signal: controller.signal })).catch(() => undefined);
        } catch {
          // A proposed browser API can change between origin-trial versions;
          // failing closed must never affect the visible UsageMax experience.
        }
      }
      return () => controller.abort();
    }

    // Older previews exposed the same shape on navigator.modelContext. Keep
    // this as a trailing fallback so the standards path remains authoritative.
    const legacyContext = detected?.source === "navigator" ? detected.context : undefined;
    if (!legacyContext?.registerTool) return undefined;
    for (const tool of tools) {
      try {
        void Promise.resolve(navigator.modelContext?.registerTool?.(tool, { signal: controller.signal })).catch(() => undefined);
      } catch {
        // Ignore unsupported preview behavior.
      }
    }
    return () => {
      controller.abort();
      if (legacyContext.unregisterTool) for (const tool of tools) legacyContext.unregisterTool(tool.name);
    };
  }, []);

  return null;
}
