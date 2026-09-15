import "server-only";
import { getSignInUrl, getSignUpUrl } from "@workos-inc/authkit-nextjs";
import { NextRequest, NextResponse } from "next/server";
import { authHref, readAuthContext, selectAuthProvider } from "./auth-flow";

export async function startAuthentication(request: NextRequest, hosted = false) {
  const query = request.nextUrl.searchParams;
  const provider = query.get("provider");
  const responseHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
  // Never initiate OAuth as an RSC fetch or speculative prefetch.
  if (request.headers.has("rsc") || /prefetch/i.test(`${request.headers.get("purpose")} ${request.headers.get("sec-purpose")}`)) {
    return new NextResponse(null, { status: 204, headers: responseHeaders });
  }
  if (!hosted && provider !== "github" && provider !== "google") {
    return NextResponse.json({ error: "Unsupported sign-in provider" }, { status: 400, headers: responseHeaders });
  }
  const mode = query.get("mode") === "sign-up" ? "sign-up" : "sign-in";
  const context = readAuthContext(Object.fromEntries(query));
  try {
    const getUrl = mode === "sign-up" ? getSignUpUrl : getSignInUrl;
    const url = await getUrl({ returnTo: context.returnTo, organizationId: context.organizationId });
    const destination = selectAuthProvider(url, context, hosted ? undefined : provider as "github" | "google");
    return NextResponse.redirect(destination, { status: 302, headers: responseHeaders });
  } catch {
    // Never expose/log OAuth URLs, cookies, provider credentials, or raw errors.
    const destination = new URL(authHref(`/${mode}`, mode, context), request.url);
    destination.searchParams.set("error", "unavailable");
    return NextResponse.redirect(destination, { status: 302, headers: responseHeaders });
  }
}
