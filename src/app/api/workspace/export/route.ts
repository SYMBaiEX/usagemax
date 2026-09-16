import { withAuth } from "@workos-inc/authkit-nextjs";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { apiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
type Dataset = "daily" | "models" | "ledger" | "audit";
export async function GET(request: Request) {
  const { user, accessToken } = await withAuth();
  if (!user || !accessToken)
    return apiError("unauthorized", 401, { hint: "Sign in to UsageMax before requesting a workspace export." });
  const dataset = new URL(request.url).searchParams.get("dataset") as Dataset;
  if (!["daily", "models", "ledger", "audit"].includes(dataset))
    return apiError("invalid_dataset", 400);
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
