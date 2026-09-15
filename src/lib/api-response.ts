import { NextResponse } from "next/server";

export function apiResponse(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("access-control-allow-origin", "*");
  response.headers.set("cache-control", "public, s-maxage=5, stale-while-revalidate=30");
  response.headers.set("x-request-id", crypto.randomUUID());
  return response;
}

export function apiError(error: string, status: number) {
  const response = NextResponse.json({ error }, { status });
  response.headers.set("access-control-allow-origin", "*");
  response.headers.set("cache-control", "no-store");
  response.headers.set("x-request-id", crypto.randomUUID());
  return response;
}
