import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../../convex/_generated/api";
import { apiResponse } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ handle: string }> }) {
  const { handle } = await context.params;
  const requestedDays = Number(new URL(request.url).searchParams.get("days") ?? 365);
  const days = await fetchQuery(api.public.daily, {
    handle,
    days: Number.isFinite(requestedDays) ? Math.min(730, Math.max(1, Math.round(requestedDays))) : 365,
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
