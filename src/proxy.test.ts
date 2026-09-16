import { describe, expect, it } from "vitest";
import { requestsMarkdown } from "./lib/markdown-negotiation";

const request = (headers: Record<string, string>) => ({ headers: new Headers(headers) });

describe("public markdown negotiation", () => {
  it.each(["GPTBot/1.0", "ClaudeBot", "ChatGPT-User", "PerplexityBot", "Google-Extended", "Applebot-Extended", "ora-agent", "DeepSeekBot"]) ("serves markdown to %s", (userAgent) => {
    expect(requestsMarkdown(request({ "user-agent": userAgent }))).toBe(true);
  });

  it("keeps ordinary HTML requests unchanged", () => {
    expect(requestsMarkdown(request({ "user-agent": "Mozilla/5.0", accept: "text/html" }))).toBe(false);
  });

  it("still honors an explicit markdown accept header", () => {
    expect(requestsMarkdown(request({ accept: "text/markdown" }))).toBe(true);
  });
});
