import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../../../convex/_generated/api";
import { apiError, apiResponse } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ handle: string }> }) {
  const { handle } = await context.params;
  const search = new URL(request.url).searchParams;
  const groupBy = search.get("groupBy") ?? "model";
  const from = search.get("from") ?? "";
  const through = search.get("through") ?? "";
  const numItems = Number(search.get("limit") ?? 100);
  const cursor = search.get("cursor");
  if (cursor !== null && (!cursor.trim() || cursor.length > 8192))
    return apiError("invalid_pagination_cursor", 400);
  if (!["model", "source", "device"].includes(groupBy) ||
      !Number.isInteger(numItems) || numItems < 1 || numItems > 500 ||
      ![from, through].every(day => /^\d{4}-\d{2}-\d{2}$/.test(day) &&
        Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day) || from > through)
    return apiError("invalid_detail_parameters", 400);
  try {
  const result = await fetchQuery(api.public.dailyDetail, {
    handle, groupBy: groupBy as "model" | "source" | "device", from, through,
    paginationOpts: { numItems, cursor, maximumRowsRead: 500, maximumBytesRead: 1_000_000 },
  });
  const response = apiResponse({ ...result, groupBy, from, through, aggregation: "additive_rows", consistentSnapshot: false });
  response.headers.set("cache-control", "no-store");
  return response;
  } catch (error) {
    // Inspect backend diagnostics only for classification; never return them or the cursor.
    const message = error instanceof Error ? error.message : "";
    if (cursor !== null && /cursor/i.test(message) && /invalid|malformed|parse|decode|different|mismatch/i.test(message))
      return apiError("invalid_pagination_cursor", 400);
    return apiError("public_detail_unavailable", 503);
  }
}
