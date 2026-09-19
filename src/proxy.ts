import { applyResponseHeaders, authkit, handleAuthkitHeaders, partitionAuthkitHeaders } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { agentHomepage } from "@/lib/agent-index";
import { requestsMachineReadable, requestsMarkdown } from "@/lib/markdown-negotiation";

const markdownRoutes: Record<string, string> = {
  "/": "/index.md",
  "/docs": "/docs.md",
  "/enterprise": "/enterprise.md",
  "/methodology": "/methodology.md",
  "/security": "/security.md",
  "/privacy": "/privacy.md",
  "/terms": "/terms.md",
  "/pricing": "/pricing.md",
  "/leaderboard": "/leaderboard.md",
  "/api-versioning": "/api-versioning.md",
  "/auth": "/auth.md",
  "/cli": "/cli.md",
  "/.well-known/api-catalog": "/.well-known/api-catalog.md",
  "/.well-known/oauth-authorization-server": "/.well-known/oauth-authorization-server.md",
  "/.well-known/oauth-protected-resource": "/.well-known/oauth-protected-resource.md",
  "/.well-known/mcp/docs-server-card.json": "/.well-known/mcp/docs-server-card.json.md",
  "/api/llms.txt": "/api/llms.txt.md",
  "/sandbox": "/sandbox.md",
  "/about": "/about.md",
  "/integrations": "/integrations.md",
  "/contact": "/contact.md",
  "/webmcp": "/webmcp.md",
  "/mcp": "/mcp.md",
  "/docs-mcp": "/docs-mcp.md",
};

const nonProfileRootPaths = new Set([
  "about", "account", "a2a", "agent-card.json", "agent-skills", "agent.json", "api-versioning.md", "api-versioning", "api", "ask", "auth.md", "auth", "callback", "cli.md", "cli", "contact",
  "AGENTS.md", "docs-mcp", "docs.md", "docs", "enterprise.md", "enterprise", "index", "index.md", "integrations.md", "integrations", "leaderboard.md", "leaderboard", "llms.txt", "mcp", "mcp.md",
  "methodology.md", "methodology", "not-found.md", "openapi.json", "pricing.md", "pricing", "privacy.md", "privacy", "profile.md", "robots.txt", "sandbox.md", "sandbox", "webmcp.md", "webmcp",
  "schema-feed.jsonl", "schemamap.xml", "security.md", "security", "server-card.json", "sign-in", "sign-up", "sitemap.xml", "terms.md", "terms", "workspace",
]);

const knownExactPaths = new Set([
  "/", "/about", "/account", "/agent-card.json", "/agent-skills/index.json", "/agent.json", "/api", "/api-versioning.md", "/api-versioning", "/ask", "/auth.md", "/auth", "/callback", "/cli.md", "/cli", "/contact",
  "/a2a", "/AGENTS.md", "/docs", "/docs-mcp", "/docs.md", "/enterprise", "/enterprise.md", "/index.md", "/integrations", "/integrations.md", "/leaderboard", "/leaderboard.md", "/llms.txt",
  "/mcp", "/mcp.md", "/docs-mcp.md", "/methodology", "/methodology.md", "/not-found.md", "/openapi.json", "/pricing", "/pricing.md", "/privacy", "/privacy.md",
  "/profile.md", "/robots.txt", "/sandbox", "/sandbox.md", "/schema-feed.jsonl", "/schemamap.xml", "/security", "/security.md", "/server-card.json", "/sign-in", "/sign-up", "/webmcp", "/webmcp.md",
  "/sitemap.xml", "/terms", "/terms.md", "/workspace",
]);

function addVary(headers: Headers, value: string) {
  const values = new Set((headers.get("vary") ?? "").split(",").map((item) => item.trim()).filter(Boolean));
  values.add(value);
  headers.set("vary", [...values].join(", "));
}

function publicHeaders(headers: Headers, cacheControl: string, markdownPath?: string, canonicalPath?: string, alternatePath?: string) {
  addVary(headers, "Accept");
  addVary(headers, "User-Agent");
  headers.set("cache-control", cacheControl);
  const links = [
    "</sitemap.xml>; rel=\"sitemap\"",
    "</.well-known/api-catalog>; rel=\"api-catalog\"; type=\"application/linkset+json\"; profile=\"https://www.rfc-editor.org/info/rfc9727\"",
    "</openapi.json>; rel=\"service-desc\"; type=\"application/vnd.oai.openapi+json\"",
    "</ask>; rel=\"nlweb\"",
  ];
  if (canonicalPath) links.push(`<${canonicalPath}>; rel=\"canonical\"`);
  if (markdownPath) links.push(`<${markdownPath}>; rel=\"alternate\"; type=\"text/markdown\"`);
  if (alternatePath) links.push(`<${alternatePath}>; rel=\"alternate\"; type=\"text/html\"`);
  headers.set("link", links.join(", "));
}

function rewriteNotFound(request: NextRequest, authHeaders: Headers) {
  const { requestHeaders, responseHeaders } = partitionAuthkitHeaders(request, authHeaders);
  const response = applyResponseHeaders(NextResponse.rewrite(new URL("/not-found.md", request.url), { request: { headers: requestHeaders } }), responseHeaders);
  publicHeaders(response.headers, "public, max-age=300, stale-while-revalidate=86400", undefined, "/not-found.md");
  return response;
}

function isKnownRoute(pathname: string) {
  return knownExactPaths.has(pathname)
    || /^\/@?[A-Za-z0-9_-]{1,80}\.md$/.test(pathname)
    || pathname.startsWith("/api/")
    || pathname.startsWith("/auth/")
    || pathname.startsWith("/docs/")
    || pathname.startsWith("/developers/")
    || pathname.startsWith("/enterprise/")
    || pathname.startsWith("/integrations/")
    || pathname.startsWith("/.well-known/");
}

export default async function proxy(request: NextRequest) {
  const { session, headers } = await authkit(request);

  if (request.nextUrl.pathname === "/" && request.nextUrl.searchParams.get("mode") === "agent") {
    const response = NextResponse.json(agentHomepage(), {
      headers: {
        "cache-control": "public, max-age=300, stale-while-revalidate=86400",
        "content-location": "https://usagemax.com/?mode=agent",
        "vary": "Accept, User-Agent",
      },
    });
    const decorated = applyResponseHeaders(response, partitionAuthkitHeaders(request, headers).responseHeaders);
    publicHeaders(decorated.headers, "public, max-age=300, stale-while-revalidate=86400");
    const discoveryLinks = [
      "</.well-known/mcp/server-card.json>; rel=\"service\"; type=\"application/json\"",
      "</.well-known/oauth-authorization-server>; rel=\"authorization-server\"; type=\"application/json\"",
      "</.well-known/oauth-protected-resource>; rel=\"protected-resource\"; type=\"application/json\"",
      "</llms.txt>; rel=\"describedby\"; type=\"text/plain\"",
    ];
    decorated.headers.set("link", `${decorated.headers.get("link") ?? ""}${decorated.headers.get("link") ? ", " : ""}${discoveryLinks.join(", ")}`);
    return decorated;
  }

  const markdownPath = markdownRoutes[request.nextUrl.pathname];
  if (markdownPath && requestsMarkdown(request)) {
    const { requestHeaders, responseHeaders } = partitionAuthkitHeaders(request, headers);
    const response = applyResponseHeaders(NextResponse.rewrite(new URL(markdownPath, request.url), { request: { headers: requestHeaders } }), responseHeaders);
    publicHeaders(response.headers, "public, max-age=3600, stale-while-revalidate=86400", undefined, markdownPath, request.nextUrl.pathname);
    return response;
  }

  // The public profile route is a one-segment dynamic route, so Next.js would
  // otherwise render the HTML app-level not-found boundary before a fallback
  // rewrite can provide the markdown representation. Probe only a potential
  // profile handle for markdown/agent requests; a 404 is safe to rewrite,
  // while any backend failure leaves the normal route/error behavior intact.
  const profileMarkdownMatch = request.nextUrl.pathname === "/profile.md"
    ? null
    : request.nextUrl.pathname.match(/^\/@?([A-Za-z0-9_-]{1,80})\.md$/);
  const rawProfileHandle = profileMarkdownMatch?.[1] ?? request.nextUrl.pathname.slice(1);
  const profileHandle = rawProfileHandle.replace(/^@/, "");
  let knownProfileRoute = false;
  if (
    (requestsMarkdown(request) || Boolean(profileMarkdownMatch))
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
        return rewriteNotFound(request, headers);
      }
      if (profileResponse.status !== 404) knownProfileRoute = true;
    } catch {
      // Preserve normal routing if the profile probe is unavailable.
    }
  }

  if ((requestsMarkdown(request) || Boolean(profileMarkdownMatch)) && knownProfileRoute) {
    const { requestHeaders, responseHeaders } = partitionAuthkitHeaders(request, headers);
    const profileMarkdownPath = "/profile.md";
    const profileMarkdownUrl = new URL(profileMarkdownPath, request.url);
    profileMarkdownUrl.searchParams.set("handle", profileHandle);
    const response = applyResponseHeaders(NextResponse.rewrite(profileMarkdownUrl, { request: { headers: requestHeaders } }), responseHeaders);
    publicHeaders(response.headers, "public, max-age=60, stale-while-revalidate=300", `/${encodeURIComponent(profileHandle)}.md`, `/${encodeURIComponent(profileHandle)}`);
    return response;
  }

  // Give agents a real markdown recovery document for unknown page paths.
  // API paths stay with the JSON catch-all so clients never receive an HTML or
  // markdown response where the API contract promises JSON.
  const assetExtension = /\.(?:html?|css|js|json|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|webmanifest)$/i;
  // Fetch clients commonly send `Accept: */*` rather than an explicit
  // markdown preference. Treat that unambiguous generic request as an
  // agent-readable recovery request, while keeping browser navigations that
  // advertise text/html on the normal styled 404 page.
  if (requestsMachineReadable(request) && !isKnownRoute(request.nextUrl.pathname) && !knownProfileRoute && !assetExtension.test(request.nextUrl.pathname)) {
    return rewriteNotFound(request, headers);
  }

  if (request.nextUrl.pathname === "/account" && !session.user) {
    return handleAuthkitHeaders(request, headers, { redirect: "/sign-in" });
  }

  const response = handleAuthkitHeaders(request, headers);
  if (markdownPath) publicHeaders(response.headers, "public, max-age=300", markdownPath, request.nextUrl.pathname);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|webmanifest)).*)",
  ],
};
