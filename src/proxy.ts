import { applyResponseHeaders, authkit, handleAuthkitHeaders, partitionAuthkitHeaders } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requestsMarkdown } from "@/lib/markdown-negotiation";

const markdownRoutes: Record<string, string> = {
  "/": "/index.md",
  "/docs": "/docs.md",
  "/enterprise": "/enterprise.md",
  "/methodology": "/methodology.md",
  "/security": "/security.md",
  "/privacy": "/privacy.md",
  "/terms": "/terms.md",
  "/leaderboard": "/leaderboard.md",
  "/.well-known/api-catalog": "/.well-known/api-catalog.md",
  "/.well-known/oauth-protected-resource": "/.well-known/oauth-protected-resource.md",
  "/api/llms.txt": "/api/llms.txt.md",
  "/sandbox": "/sandbox.md",
};

const nonProfileRootPaths = new Set([
  "about", "account", "api-versioning.md", "api", "ask", "auth.md", "auth", "callback", "cli.md", "contact",
  "docs-mcp", "docs.md", "docs", "enterprise.md", "enterprise", "index.md", "leaderboard.md", "leaderboard", "llms.txt",
  "methodology.md", "methodology", "not-found.md", "openapi.json", "privacy.md", "privacy", "robots.txt", "sandbox.md", "sandbox",
  "schema-feed.jsonl", "schemamap.xml", "security.md", "security", "sign-in", "sign-up", "sitemap.xml", "terms.md", "terms", "workspace",
]);

function addVary(headers: Headers, value: string) {
  const values = new Set((headers.get("vary") ?? "").split(",").map((item) => item.trim()).filter(Boolean));
  values.add(value);
  headers.set("vary", [...values].join(", "));
}

function publicHeaders(headers: Headers, cacheControl: string, markdownPath?: string) {
  addVary(headers, "Accept");
  addVary(headers, "User-Agent");
  headers.set("cache-control", cacheControl);
  const links = [
    "</sitemap.xml>; rel=\"sitemap\"",
    "</.well-known/api-catalog>; rel=\"api-catalog\"; type=\"application/linkset+json\"; profile=\"https://www.rfc-editor.org/info/rfc9727\"",
    "</openapi.json>; rel=\"service-desc\"; type=\"application/vnd.oai.openapi+json\"",
    "</ask>; rel=\"nlweb\"",
  ];
  if (markdownPath) links.push(`<${markdownPath}>; rel=\"alternate\"; type=\"text/markdown\"`);
  headers.set("link", links.join(", "));
}

function agentHomepage() {
  return {
    schemaVersion: "1.0",
    type: "agent-capability-index",
    name: "UsageMax",
    description: "A public observability layer for bounded AI usage telemetry.",
    canonicalUrl: "https://usagemax.com/?mode=agent",
    capabilities: ["public aggregate usage", "leaderboard", "documentation", "OpenAPI", "MCP", "A2A"],
    publicData: ["network totals", "public profiles", "bounded daily rollups", "bounded live activity"],
    exclusions: ["prompts", "completions", "credentials", "private workspace data"],
    authentication: {
      publicReads: "none",
      collectorWrites: "installation-bound write-only bearer token",
      website: "WorkOS AuthKit session; not an API token",
    },
    endpoints: [
      { name: "networkStats", method: "GET", path: "/api/stats", authentication: "none" },
      { name: "leaderboard", method: "GET", path: "/api/leaderboard", authentication: "none" },
      { name: "publicProfile", method: "GET", path: "/api/profiles/{handle}", authentication: "none" },
      { name: "collectorStatus", method: "GET", path: "/api/v1/devices/status", authentication: "collector bearer", readOnly: true, returnsSecret: false },
      { name: "openapi", method: "GET", path: "/openapi.json", authentication: "none" },
      { name: "mcp", method: "POST", path: "/mcp", authentication: "none", readOnly: true },
      { name: "sandbox", method: "POST", path: "/api/v1/sandbox/validate", authentication: "none", writes: false },
    ],
    resources: [
      { name: "openapi", url: "/openapi.json", contentType: "application/vnd.oai.openapi+json", authentication: "none", readOnly: true },
      { name: "mcp-discovery", url: "/.well-known/mcp", contentType: "application/json", authentication: "none", readOnly: true },
      { name: "a2a-agent-card", url: "/.well-known/agent-card.json", contentType: "application/json", authentication: "none", readOnly: true },
      { name: "agent-skills", url: "/.well-known/agent-skills/index.json", contentType: "application/json", authentication: "none", readOnly: true },
    ],
    protocols: {
      mcp: { endpoint: "/mcp", transport: "streamable-http", protocolVersion: "2025-06-18", authentication: "none", readOnly: true },
      a2a: { endpoint: "/a2a", transport: "json-rpc", authentication: "none", readOnly: true },
    },
    limits: {
      publicLeaderboardRows: 100,
      sandbox: { maxBytes: 16_384, maxEvents: 100, writes: false },
      mcp: { maxBodyBytes: 65_536, writes: false },
    },
    errors: { format: "application/json", schema: "/openapi.json#/components/schemas/Error", recovery: "/not-found.md" },
    links: {
      markdown: "/index.md",
      docs: "/docs",
      api: "/openapi.json",
      mcp: "/mcp",
      a2a: "/a2a",
      ask: "/ask",
      skills: "/.well-known/agent-skills/index.json",
    },
  };
}

export default async function proxy(request: NextRequest) {
  const { session, headers } = await authkit(request);

  if (request.nextUrl.pathname === "/" && request.nextUrl.searchParams.get("mode") === "agent") {
    const response = NextResponse.json(agentHomepage(), { headers: { "cache-control": "public, max-age=300", "vary": "Accept" } });
    return applyResponseHeaders(response, partitionAuthkitHeaders(request, headers).responseHeaders);
  }

  const markdownPath = markdownRoutes[request.nextUrl.pathname];
  if (markdownPath && requestsMarkdown(request)) {
    const { requestHeaders, responseHeaders } = partitionAuthkitHeaders(request, headers);
    const response = applyResponseHeaders(NextResponse.rewrite(new URL(markdownPath, request.url), { request: { headers: requestHeaders } }), responseHeaders);
    publicHeaders(response.headers, "public, max-age=3600, stale-while-revalidate=86400", markdownPath);
    return response;
  }

  // The public profile route is a one-segment dynamic route, so Next.js would
  // otherwise render the HTML app-level not-found boundary before a fallback
  // rewrite can provide the markdown representation. Probe only a potential
  // profile handle for markdown/agent requests; a 404 is safe to rewrite,
  // while any backend failure leaves the normal route/error behavior intact.
  const profileHandle = request.nextUrl.pathname.slice(1);
  if (
    requestsMarkdown(request)
    && profileHandle
    && !profileHandle.includes("/")
    && /^[A-Za-z0-9_-]{1,80}$/.test(profileHandle)
    && !nonProfileRootPaths.has(profileHandle)
  ) {
    try {
      const profileResponse = await fetch(new URL(`/api/profiles/${encodeURIComponent(profileHandle)}`, request.url), {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      if (profileResponse.status === 404) {
        const { requestHeaders, responseHeaders } = partitionAuthkitHeaders(request, headers);
        const response = applyResponseHeaders(NextResponse.rewrite(new URL("/not-found.md", request.url), { request: { headers: requestHeaders } }), responseHeaders);
        publicHeaders(response.headers, "public, max-age=300, stale-while-revalidate=86400", "/not-found.md");
        return response;
      }
    } catch {
      // Preserve normal routing if the profile probe is unavailable.
    }
  }

  if (request.nextUrl.pathname === "/account" && !session.user) {
    return handleAuthkitHeaders(request, headers, { redirect: "/sign-in" });
  }

  const response = handleAuthkitHeaders(request, headers);
  if (markdownPath) publicHeaders(response.headers, "public, max-age=300", markdownPath);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|webmanifest)).*)",
  ],
};
