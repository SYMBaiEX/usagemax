import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../../convex/_generated/api";
import { apiError, apiResponse } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ handle: string }> }) {
  const { handle } = await context.params;
  const now = Date.now();
  const [profile, daily, live] = await Promise.all([
    fetchQuery(api.public.profile, { handle }),
    fetchQuery(api.public.daily, { handle, days: 60 }),
    fetchQuery(api.public.live, { handle, now, agentLimit: 50, eventLimit: 40 }),
  ]);
  if (!profile?.stats) return apiError("profile_not_found", 404);
  return apiResponse({
    generatedAt: now,
    profile: {
      handle: profile.profile.handle,
      displayName: profile.profile.displayName,
      avatarUrl: profile.profile.avatarUrl ?? null,
      verification: profile.profile.verification,
    },
    stats: profile.stats,
    models: profile.models,
    daily,
    agents: live.agents,
    events: live.events.map((event) => ({
      eventKey: event.eventKey,
      occurredAt: event.occurredAt,
      type: event.eventType,
      agent: event.agentName ?? event.agentExternalId ?? "agent",
      model: event.model,
      provider: event.provider,
      status: event.status,
      state: event.state ?? null,
      task: event.task ?? null,
      totalTokens: event.totalTokens,
      costMicros: event.costMicros,
      latencyMs: event.latencyMs ?? null,
      traceId: event.traceId ?? null,
    })),
  });
}
