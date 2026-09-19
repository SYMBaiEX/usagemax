import { NextResponse } from "next/server";

export const dynamic = "force-static";

const iconUrl = "https://usagemax.com/brand/icon-light.png";

export function GET(request: Request) {
  return NextResponse.redirect(new URL(iconUrl, request.url), 308);
}

export function HEAD(request: Request) {
  return NextResponse.redirect(new URL(iconUrl, request.url), 308);
}
