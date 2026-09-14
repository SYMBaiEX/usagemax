import { authkit, handleAuthkitHeaders } from "@workos-inc/authkit-nextjs";
import type { NextRequest } from "next/server";

export default async function proxy(request: NextRequest) {
  const { session, headers } = await authkit(request);

  if (request.nextUrl.pathname === "/account" && !session.user) {
    return handleAuthkitHeaders(request, headers, { redirect: "/sign-in" });
  }

  return handleAuthkitHeaders(request, headers);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|webmanifest)).*)",
  ],
};
