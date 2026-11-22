import { withAuth } from "@workos-inc/authkit-nextjs";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { apiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
type Dataset = "daily" | "models" | "ledger" | "audit" | "telemetry" | "agents" | "outcomes";
export async function GET(request: Request) {
  const { user, accessToken } = await withAuth();
  if (!user || !accessToken)
    return apiError("unauthorized", 401, { hint: "Sign in to UsageMax before requesting a workspace export." });
  const search = new URL(request.url).searchParams;
  const dataset = search.get("dataset") as Dataset;
  if (!["daily", "models", "ledger", "audit", "telemetry", "agents", "outcomes"].includes(dataset))
    return apiError("invalid_dataset", 400);
  const from = search.get("from");
  const through = search.get("through");
  const model = search.get("model");
  const source = search.get("source");
  let dailyFilters: FunctionArgs<typeof api.personal.exportPage>["dailyFilters"];
  if (dataset === "daily" && (from !== null || through !== null || model !== null || source !== null)) {
    if (!from || !through || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(through)
      || from > through || (model?.length ?? 0) > 200 || (source?.length ?? 0) > 200) {
      return apiError("invalid_daily_filters", 400);
    }
    dailyFilters = { startDay: from, endDay: through, model: model || undefined, source: source || undefined };
  }
  const options = { token: accessToken };
  type Page = FunctionReturnType<typeof api.personal.exportPage>;
  let first: Page;
  let expectedWorkspaceId: FunctionReturnType<
    typeof api.workspaces.overview
  >["workspace"]["id"];
  try {
    expectedWorkspaceId = (
      await fetchQuery(api.workspaces.overview, {}, options)
    ).workspace.id;
    first = await fetchQuery(
      api.personal.exportPage,
      {
        dataset,
        dailyFilters,
        expectedWorkspaceId,
        paginationOpts: { numItems: 250, cursor: null },
      },
      options,
    );
    await fetchMutation(api.personal.beginExport, { dataset }, options);
  } catch {
    return apiError("forbidden", 403, { hint: "Refresh your UsageMax session and confirm that your workspace role permits exports." });
  }
  let cancelled = false;
  let current: Page | null = first;
  let cursor: string | null = null;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (cancelled || request.signal.aborted) {
        controller.close();
        return;
      }
      try {
        const page: Page =
          current ??
          (await fetchQuery(
            api.personal.exportPage,
            {
              dataset,
              dailyFilters,
              expectedWorkspaceId,
              paginationOpts: { numItems: 250, cursor },
            },
            options,
          ));
        current = null;
        if (cancelled || request.signal.aborted) return;
        controller.enqueue(
          encoder.encode(
            page.page.map((row) => JSON.stringify(row)).join("\n") +
              (page.page.length ? "\n" : ""),
          ),
        );
        cursor = page.continueCursor;
        if (page.isDone) {
          // A completion marker distinguishes a complete export from a dropped connection.
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                _export: "complete",
                dataset,
                consistentSnapshot: false,
              }) + "\n",
            ),
          );
          controller.close();
        }
      } catch {
        controller.error(new Error("Export interrupted; retry the download."));
      }
    },
    cancel() {
      cancelled = true;
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Content-Disposition": `attachment; filename="usagemax-${dataset}.ndjson"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
