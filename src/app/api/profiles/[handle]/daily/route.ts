import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../../convex/_generated/api";
import { apiResponse } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ handle: string }> }) {
  const { handle } = await context.params;
  const searchParams = new URL(request.url).searchParams;
  const requestedDays = Number(searchParams.get("days") ?? 365);
  const limit = Number.isFinite(requestedDays) ? Math.min(730, Math.max(1, Math.round(requestedDays))) : 365;
  const requestedGroup = searchParams.get("groupBy");
  const groupBy = requestedGroup === "model" || requestedGroup === "source" || requestedGroup === "device"
    ? requestedGroup
    : null;
  if (groupBy === "model") {
    const rows = await fetchQuery(api.public.dailyModels, { handle, days: limit });
    return apiResponse({
      groupBy,
      range: { first: rows[0]?.date ?? null, last: rows.at(-1)?.date ?? null },
      days: rows.map((row) => ({
        date: row.date,
        key: row.model,
        totalTokens: row.totalTokens,
        costUsd: row.costMicros / 1_000_000,
        costBasis: row.costBasis,
        sessions: 0,
      })),
    });
  }
  if (groupBy === "source" || groupBy === "device") {
    const rows = await fetchQuery(api.public.dailyBreakdown, { handle, days: limit, groupBy });
    return apiResponse({
      groupBy,
      range: { first: rows[0]?.date ?? null, last: rows.at(-1)?.date ?? null },
      days: rows.map((row) => ({
        date: row.date,
        key: row.key,
        totalTokens: row.totalTokens,
        outputTokens: row.outputTokens,
        unclassifiedTokens: row.unclassifiedTokens,
        costUsd: row.costMicros / 1_000_000,
        costBasis: row.costBasis,
        sessions: row.sessions,
      })),
    });
  }
  const days = await fetchQuery(api.public.daily, {
    handle,
    days: limit,
  });
  return apiResponse({
    range: { first: days[0]?.date ?? null, last: days.at(-1)?.date ?? null },
    days: days.map((day) => ({
      date: day.date,
      totalTokens: day.totalTokens,
      outputTokens: day.outputTokens,
      unclassifiedTokens: day.unclassifiedTokens,
      costUsd: day.costMicros / 1_000_000,
      costBasis: day.costBasis,
      sessions: day.sessions,
      requests: day.requests,
      errors: day.errors,
    })),
  });
}
