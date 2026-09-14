import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../convex/_generated/api";
import { apiError, apiResponse } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const metric = params.get("metric") ?? "tokens";
  const period = params.get("window") ?? params.get("period") ?? "all";
  if (metric !== "tokens" && metric !== "spend") return apiError("invalid_metric", 400);
  if (period !== "7d" && period !== "30d" && period !== "all") return apiError("invalid_window", 400);
  const rows = await fetchQuery(api.public.leaderboard, { metric, period, limit: 100 });
  return apiResponse({
    metric,
    window: period,
    generatedAt: new Date().toISOString(),
    leaderboard: rows.map((row, index) => ({
      rank: index + 1,
      user: {
        login: row.handle,
        name: row.displayName,
        avatarUrl: row.avatarUrl ?? null,
      },
      score: row.score,
      totalTokens: row.totalTokens,
      totalSpendUsd: row.totalCostMicros / 1_000_000,
      verification: row.verification,
      updatedAt: row.updatedAt,
    })),
  });
}
