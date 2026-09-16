import { applyResponseHeaders, authkit, handleAuthkitHeaders, partitionAuthkitHeaders } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const markdownRoutes: Record<string, string> = {
  "/": "/index.md",
  "/docs": "/docs.md",
  "/enterprise": "/enterprise.md",
  "/methodology": "/methodology.md",
  "/security": "/security.md",
  "/privacy": "/privacy.md",
  "/terms": "/terms.md",
  "/leaderboard": "/leaderboard.md",
};

function acceptsMarkdown(request: NextRequest) {
  return request.headers.get("accept")?.toLowerCase().includes("text/markdown") ?? false;
}

function addVary(headers: Headers, value: string) {
  const values = new Set((headers.get("vary") ?? "").split(",").map((item) => item.trim()).filter(Boolean));
  values.add(value);
  headers.set("vary", [...values].join(", "));
}

function publicHeaders(headers: Headers, cacheControl: string, markdownPath?: string) {
  addVary(headers, "Accept");
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
    name: "UsageMax",
    description: "A public observability layer for bounded AI usage telemetry.",
    capabilities: ["public aggregate usage", "leaderboard", "documentation", "OpenAPI", "MCP"],
    publicData: ["network totals", "public profiles", "bounded daily rollups", "bounded live activity"],
    exclusions: ["prompts", "completions", "credentials", "private workspace data"],
    links: {
      markdown: "/index.md",
      docs: "/docs",
      api: "/openapi.json",
      mcp: "/mcp",
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
  if (markdownPath && acceptsMarkdown(request)) {
    const { requestHeaders, responseHeaders } = partitionAuthkitHeaders(request, headers);
    const response = applyResponseHeaders(NextResponse.rewrite(new URL(markdownPath, request.url), { request: { headers: requestHeaders } }), responseHeaders);
    publicHeaders(response.headers, "public, max-age=3600, stale-while-revalidate=86400", markdownPath);
    return response;
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
