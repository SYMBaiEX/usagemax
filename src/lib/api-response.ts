import { NextResponse } from "next/server";

const errorGuidance: Record<string, { message: string; hint: string }> = {
  invalid_metric: { message: "The leaderboard metric is not supported.", hint: "Use metric=tokens or metric=spend." },
  invalid_window: { message: "The leaderboard window is not supported.", hint: "Use window=7d, window=30d, or window=all." },
  profile_not_found: { message: "No public UsageMax profile was found for this handle.", hint: "Check the handle or choose a profile from /leaderboard." },
  invalid_pagination_cursor: { message: "The pagination cursor is invalid or expired.", hint: "Start the bounded query again without cursor." },
  invalid_detail_parameters: { message: "The detail query parameters are invalid.", hint: "Provide groupBy=model|source|device and inclusive YYYY-MM-DD from and through dates." },
  public_detail_unavailable: { message: "The public detail query is temporarily unavailable.", hint: "Retry later or use the summary endpoint." },
  screen_api_retired: { message: "The local screen API is retired.", hint: "The HUD is a separate project; use the public UsageMax APIs for usage data." },
  invalid_sandbox_input: { message: "The sandbox validation input is invalid.", hint: "Send only bounded aggregate telemetry metadata; prompts, completions, secrets, and unknown fields are rejected." },
  api_root: { message: "Choose a documented UsageMax API endpoint.", hint: "Use /api/stats or /api/leaderboard for public reads; collector writes require the documented bearer credential and device header." },
  invalid_dataset: { message: "The export dataset is not supported.", hint: "Use dataset=daily, dataset=models, dataset=ledger, or dataset=audit." },
  forbidden: { message: "The authenticated account cannot perform this operation.", hint: "Refresh your UsageMax session or ask a workspace administrator for access." },
  service_unavailable: { message: "The UsageMax data service is temporarily unavailable.", hint: "Retry later and include the x-request-id if the problem persists." },
  api_route_not_found: { message: "This UsageMax API route does not exist.", hint: "Use the OpenAPI contract or the API guide to choose a supported endpoint." },
};

const API_DOCUMENTATION = "https://usagemax.com/docs";

export type ApiErrorBody = { error: string; message: string; hint: string; documentation: string };
export type ApiRateLimitPolicy = { limit: number; windowSeconds: number };

export const API_VERSION = "1";
export const PUBLIC_READ_RATE_LIMIT = { limit: 60, windowSeconds: 60 } as const;

export function applyRateLimitHeaders(headers: Headers, policy: ApiRateLimitPolicy = PUBLIC_READ_RATE_LIMIT) {
  headers.set("RateLimit-Policy", `${policy.limit};w=${policy.windowSeconds}`);
  headers.set("RateLimit-Limit", String(policy.limit));
  headers.set("RateLimit-Reset", String(policy.windowSeconds));
  // Remaining is intentionally omitted: this response helper does not own a
  // shared counter, so reporting a number here would be misleading.
}

export function apiResponse(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("access-control-allow-origin", "*");
  response.headers.set("cache-control", "public, s-maxage=5, stale-while-revalidate=30");
  response.headers.set("x-request-id", crypto.randomUUID());
  response.headers.set("x-api-version", API_VERSION);
  applyRateLimitHeaders(response.headers);
  return response;
}

export function apiError(error: string, status: number, guidance?: Partial<{ message: string; hint: string; documentation: string }>, rateLimitPolicy?: ApiRateLimitPolicy) {
  const detail = errorGuidance[error] ?? {
    message: "The request could not be completed.",
    hint: "Check the request and consult https://usagemax.com/docs.",
  };
  const body: ApiErrorBody = { error, message: guidance?.message ?? detail.message, hint: guidance?.hint ?? detail.hint, documentation: guidance?.documentation ?? API_DOCUMENTATION };
  const response = NextResponse.json(body, { status });
  response.headers.set("access-control-allow-origin", "*");
  response.headers.set("cache-control", "no-store");
  response.headers.set("x-request-id", crypto.randomUUID());
  response.headers.set("x-api-version", API_VERSION);
  if (rateLimitPolicy) {
    applyRateLimitHeaders(response.headers, rateLimitPolicy);
  }
  return response;
}
