const aiBotPattern = /(?:GPTBot|ClaudeBot|ChatGPT-User|PerplexityBot|Google-Extended|Applebot-Extended|ora-agent|DeepSeekBot)/i;

type HeaderReader = { headers: { get(name: string): string | null } };

export function requestsMarkdown(request: HeaderReader) {
  return request.headers.get("accept")?.toLowerCase().includes("text/markdown")
    || aiBotPattern.test(request.headers.get("user-agent") ?? "");
}
