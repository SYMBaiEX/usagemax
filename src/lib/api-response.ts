import { NextResponse } from "next/server";

export function apiResponse(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("access-control-allow-origin", "*");
  response.headers.set("cache-control", "public, s-maxage=5, stale-while-revalidate=30");
  return response;
}

export function apiError(error: string, status: number) {
  return apiResponse({ error }, { status });
}
