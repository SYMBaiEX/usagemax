"use client";

import { useEffect } from "react";

type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<unknown>;
};

type ModelContext = {
  registerTool?: (tool: ToolDefinition) => void | (() => void);
  unregisterTool?: (name: string) => void;
};

type ModelContextDocument = Document & { modelContext?: ModelContext };
type ModelContextNavigator = Navigator & { modelContext?: ModelContext };

async function readPublicJson(path: string) {
  const response = await fetch(path, { cache: "no-store", credentials: "omit", headers: { accept: "application/json" } });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === "object" && "message" in body ? String(body.message) : `UsageMax returned HTTP ${response.status}.`;
    throw new Error(message);
  }
  return body;
}

const tools: ToolDefinition[] = [
  {
    name: "usagemax_network_stats",
    description: "Read bounded public aggregate UsageMax network statistics.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
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
    execute: async (input) => {
      const handle = typeof input.handle === "string" ? input.handle.trim() : "";
      if (!/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(handle)) throw new Error("Use a valid public UsageMax handle.");
      return readPublicJson(`/api/profiles/${encodeURIComponent(handle)}`);
    },
  },
];

export function WebMcpTools() {
  useEffect(() => {
    // WebMCP is a progressive enhancement. Unsupported browsers pay only for
    // this feature-detection branch and keep the normal UI unchanged.
    const context = (document as ModelContextDocument).modelContext
      ?? (navigator as ModelContextNavigator).modelContext;
    if (!context?.registerTool) return undefined;

    const cleanups: Array<() => void> = [];
    for (const tool of tools) {
      try {
        const cleanup = context.registerTool(tool);
        if (typeof cleanup === "function") cleanups.push(cleanup);
      } catch {
        // A proposed browser API can change between origin-trial versions;
        // failing closed must never affect the visible UsageMax experience.
      }
    }
    return () => {
      for (const cleanup of cleanups) cleanup();
      if (context.unregisterTool) for (const tool of tools) context.unregisterTool(tool.name);
    };
  }, []);

  return null;
}
