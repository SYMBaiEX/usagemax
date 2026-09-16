import type { MetadataRoute } from "next";

const baseUrl = "https://usagemax.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: baseUrl, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${baseUrl}/leaderboard`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${baseUrl}/docs`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/auth.md`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${baseUrl}/openapi.json`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    { url: `${baseUrl}/mcp`, lastModified: now, changeFrequency: "weekly", priority: 0.4 },
    { url: `${baseUrl}/docs-mcp`, lastModified: now, changeFrequency: "weekly", priority: 0.4 },
    { url: `${baseUrl}/.well-known/mcp`, lastModified: now, changeFrequency: "weekly", priority: 0.4 },
    { url: `${baseUrl}/.well-known/mcp/server-card.json`, lastModified: now, changeFrequency: "weekly", priority: 0.4 },
    { url: `${baseUrl}/.well-known/oauth-protected-resource`, lastModified: now, changeFrequency: "weekly", priority: 0.4 },
    { url: `${baseUrl}/schemamap.xml`, lastModified: now, changeFrequency: "weekly", priority: 0.3 },
    { url: `${baseUrl}/schema-feed.jsonl`, lastModified: now, changeFrequency: "weekly", priority: 0.3 },
    { url: `${baseUrl}/.well-known/ard.json`, lastModified: now, changeFrequency: "weekly", priority: 0.4 },
    { url: `${baseUrl}/.well-known/agent-skills/index.json`, lastModified: now, changeFrequency: "weekly", priority: 0.4 },
    { url: `${baseUrl}/.well-known/api-catalog`, lastModified: now, changeFrequency: "weekly", priority: 0.4 },
    { url: `${baseUrl}/methodology`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/security`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/enterprise`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${baseUrl}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
