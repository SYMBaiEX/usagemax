const aiBotPattern = /(?:GPTBot|OAI-SearchBot|ClaudeBot|anthropic-ai|ChatGPT-User|PerplexityBot|Google-Extended|Google-CloudVertexBot|Applebot-Extended|Bytespider|CCBot|FacebookBot|PetalBot|YouBot|cohere-ai|ora-agent|DeepSeekBot)/i;

type HeaderReader = { headers: { get(name: string): string | null } };

export function requestsMarkdown(request: HeaderReader) {
  const accept = request.headers.get("accept") ?? "";
  const markdownQualities = accept.split(",").flatMap((part) => {
    const [mediaType, ...parameters] = part.trim().toLowerCase().split(";");
    if (mediaType !== "text/markdown") return [];
    const quality = parameters.find((parameter) => parameter.trim().startsWith("q="))?.trim().slice(2);
    const parsed = quality === undefined ? 1 : Number(quality);
    return Number.isFinite(parsed) ? [parsed] : [0];
  });

  return (markdownQualities.length > 0 && Math.max(...markdownQualities) > 0)
    || aiBotPattern.test(request.headers.get("user-agent") ?? "");
}

export function requestsMachineReadable(request: HeaderReader) {
  const accept = request.headers.get("accept") ?? "";
  const generic = accept.trim().split(",")[0]?.trim() === "*/*";
  return requestsMarkdown(request) || generic;
}
