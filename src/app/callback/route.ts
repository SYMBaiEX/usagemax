import { handleAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";

export const GET = handleAuth({
  returnPathname: "/account",
  onError: ({ request }) => {
    const destination = new URL("/sign-in", request.url);
    const cancelled = request.nextUrl.searchParams.get("error") === "access_denied";
    destination.searchParams.set("error", cancelled ? "cancelled" : "verification");
    return NextResponse.redirect(destination);
  },
});
