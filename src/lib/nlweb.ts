export const NLWEB_VERSION = "0.5";

type Resource = {
  url: string;
  name: string;
  description: string;
  keywords: string[];
  schemaObject: Record<string, unknown>;
};

export type NlwebResult = {
  url: string;
  name: string;
  site: string;
  score: number;
  description: string;
  schema_object: Record<string, unknown>;
};

const resources: Resource[] = [
  {
    url: "https://usagemax.com/docs",
    name: "UsageMax documentation",
    description: "Connect supported coding-agent histories or send bounded, content-free model and tool telemetry through the UsageMax API.",
    keywords: ["usage", "telemetry", "collector", "api", "opentelemetry", "models", "agents", "link", "computer"],
    schemaObject: { "@context": "https://schema.org", "@type": "TechArticle", name: "UsageMax documentation", url: "https://usagemax.com/docs" },
  },
  {
    url: "https://usagemax.com/methodology",
    name: "UsageMax counting methodology",
    description: "Understand additive token accounting, idempotency, cost basis, ranking windows, and the difference between activity and accounting.",
    keywords: ["count", "counting", "methodology", "tokens", "cost", "pricing", "rank", "ranking", "accounting", "estimate"],
    schemaObject: { "@context": "https://schema.org", "@type": "TechArticle", name: "UsageMax counting methodology", url: "https://usagemax.com/methodology" },
  },
  {
    url: "https://usagemax.com/security",
    name: "UsageMax security and data boundaries",
    description: "Review private-by-default profiles, tenant-scoped workspaces, installation-bound collector keys, replay protection, and payload limits.",
    keywords: ["security", "privacy", "private", "workspace", "tenant", "collector", "token", "key", "revoke", "data", "prompt", "secret"],
    schemaObject: { "@context": "https://schema.org", "@type": "TechArticle", name: "UsageMax security", url: "https://usagemax.com/security" },
  },
  {
    url: "https://usagemax.com/enterprise",
    name: "UsageMax for teams",
    description: "Connect teams and computers, preserve project and cost-center context, invite members with scoped roles, and keep company data private.",
    keywords: ["team", "teams", "enterprise", "company", "members", "invite", "roles", "projects", "cost", "workspace", "sso"],
    schemaObject: { "@context": "https://schema.org", "@type": "Service", name: "UsageMax for teams", url: "https://usagemax.com/enterprise" },
  },
  {
    url: "https://usagemax.com/leaderboard",
    name: "UsageMax public leaderboard",
    description: "Compare opt-in public profiles by bounded token usage or tracked cost across 7-day, 30-day, and all-time windows.",
    keywords: ["leaderboard", "rank", "profile", "public", "tokens", "spend", "cost", "activity", "compare"],
    schemaObject: { "@context": "https://schema.org", "@type": "Dataset", name: "UsageMax public leaderboard", url: "https://usagemax.com/leaderboard" },
  },
  {
    url: "https://usagemax.com/auth.md",
    name: "UsageMax authentication guide",
    description: "Use public reads without credentials or link a local installation to receive a write-only collector token. Website WorkOS sign-in is separate from API credentials.",
    keywords: ["auth", "authentication", "sign in", "oauth", "workos", "token", "collector", "link", "revoke", "credentials"],
    schemaObject: { "@context": "https://schema.org", "@type": "TechArticle", name: "UsageMax authentication guide", url: "https://usagemax.com/auth.md" },
  },
];

const stopWords = new Set(["a", "an", "and", "are", "can", "do", "does", "for", "how", "i", "is", "of", "on", "or", "the", "to", "what", "where", "with", "usage", "max"]);

function queryWords(query: string) {
  return query.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !stopWords.has(word));
}

export function answerForQuery(query: string, queryId = crypto.randomUUID()) {
  const words = queryWords(query);
  const scored = resources.map((resource) => {
    const haystack = `${resource.name} ${resource.description} ${resource.keywords.join(" ")}`.toLowerCase();
    const matches = words.filter((word) => haystack.includes(word));
    return { resource, score: matches.length ? Math.min(100, 50 + matches.length * 10) : 0 };
  }).filter(({ score }) => score > 0).sort((left, right) => right.score - left.score || left.resource.name.localeCompare(right.resource.name)).slice(0, 5);

  const results: NlwebResult[] = scored.map(({ resource, score }) => ({
    url: resource.url,
    name: resource.name,
    site: "usagemax.com",
    score,
    description: resource.description,
    schema_object: resource.schemaObject,
  }));
  const sources = results.map((item) => item.url);
  const answer = results.length
    ? `UsageMax can help with ${results.slice(0, 2).map((item) => item.name.toLowerCase()).join(" and ")}. The linked resources describe the supported public surface and integration boundaries.`
    : "This bounded endpoint answers questions about UsageMax usage reporting, integrations, security, teams, and public profiles. Try asking about telemetry, authentication, counting, or enterprise workspaces.";

  return {
    _meta: { response_type: "answer", version: NLWEB_VERSION },
    query_id: queryId,
    answer,
    results,
    sources,
  };
}

export function failureForQuery(code: string, message: string, queryId = crypto.randomUUID()) {
  return { _meta: { response_type: "failure", version: NLWEB_VERSION }, query_id: queryId, error: { code, message } };
}
