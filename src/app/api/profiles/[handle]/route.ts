import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import { apiError, apiResponse } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ handle: string }> }) {
  const { handle } = await context.params;
  const result = await fetchQuery(api.public.profile, { handle });
  if (!result?.stats) return apiError("profile_not_found", 404);
  return apiResponse({
    user: {
      login: result.profile.handle,
      name: result.profile.displayName,
      avatarUrl: result.profile.avatarUrl ?? null,
      bio: result.profile.bio,
      verified: result.profile.isVerified,
      verification: result.profile.verification,
    },
    stats: {
      activeDays: result.stats.activeDays,
      currentStreakDays: result.stats.currentStreakDays,
      deviceCount: result.stats.deviceCount,
      firstDate: result.stats.firstDay ?? null,
      lastDate: result.stats.lastDay ?? null,
      longestStreakDays: result.stats.longestStreakDays,
      sessionCount: result.stats.sessions,
      topModel: result.stats.topModel,
      totalSpendUsd: result.stats.totalCostMicros / 1_000_000,
      totalTokens: result.stats.totalTokens,
      inputTokens: result.stats.inputTokens,
      outputTokens: result.stats.outputTokens,
      cacheReadTokens: result.stats.cacheReadTokens,
      reasoningTokens: result.stats.reasoningTokens,
      lastEventAt: result.stats.lastEventAt ?? null,
    },
    models: result.models.map((model) => ({
      provider: model.provider,
      model: model.model,
      totalTokens: model.totalTokens,
      spendUsd: model.costMicros / 1_000_000,
      requests: model.requests,
      errors: model.errors,
      lastUsedAt: model.lastUsedAt,
    })),
  });
}
