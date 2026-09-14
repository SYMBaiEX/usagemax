import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import { apiError, apiResponse } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ handle: string }> }) {
  const { handle } = await context.params;
  const result = await fetchQuery(api.public.profile, { handle });
  if (!result?.stats) return apiError("profile_not_found", 404);
  const stats = result.stats;
  return apiResponse({
    user: {
      login: result.profile.handle,
      name: result.profile.displayName,
      avatarUrl: result.profile.avatarUrl ?? null,
      bio: result.profile.bio,
      verified: result.profile.isVerified,
      verification: result.profile.verification,
      importedAt: result.profile.importedAt ?? null,
    },
    stats: {
      activeDays: stats.activeDays,
      currentStreakDays: stats.currentStreakDays,
      deviceCount: stats.deviceCount,
      firstDate: stats.firstDay ?? null,
      lastDate: stats.lastDay ?? null,
      longestStreakDays: stats.longestStreakDays,
      sessionCount: stats.sessions,
      topModel: stats.topModel,
      totalSpendUsd: stats.totalCostMicros / 1_000_000,
      totalTokens: stats.totalTokens,
      inputTokens: stats.inputTokens,
      outputTokens: stats.outputTokens,
      cacheReadTokens: stats.cacheReadTokens,
      cacheWriteTokens: stats.cacheWriteTokens ?? 0,
      reasoningTokens: stats.reasoningTokens,
      unclassifiedTokens: stats.unclassifiedTokens ?? 0,
      costBasis: stats.costBasis ?? "unknown",
      costSource: stats.costSource ?? null,
      sources: stats.sources ?? [],
      lastEventAt: stats.lastEventAt ?? null,
    },
    models: result.models.map((model) => ({
      provider: model.provider,
      model: model.model,
      totalTokens: model.totalTokens,
      spendUsd: model.costMicros / 1_000_000,
      costBasis: model.costBasis ?? stats.costBasis ?? "unknown",
      cacheReadTokens: model.cacheReadTokens ?? 0,
      cacheWriteTokens: model.cacheWriteTokens ?? 0,
      reasoningTokens: model.reasoningTokens ?? 0,
      unclassifiedTokens: model.unclassifiedTokens ?? 0,
      requests: model.requests,
      errors: model.errors,
      lastUsedAt: model.lastUsedAt,
    })),
  });
}
