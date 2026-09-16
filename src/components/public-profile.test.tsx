// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
import { getFunctionName } from "convex/server";

const state = vi.hoisted(() => ({ live: undefined as unknown, calls: [] as Array<{ name: string; args: unknown }> }));
vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://test.convex.cloud");
vi.mock("convex/react", () => ({
  useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
    const name = getFunctionName(ref);
    state.calls.push({ name, args });
    if (name === "public:live") return state.live;
    return { profile: { handle: "public", displayName: "Public", bio: "" }, stats: null, models: [], daily: [], dailyModels: [], breakdowns: { sources: [], devices: [] }, coverage: { daily: "truncated", dailyModels: "truncated", sources: "truncated", devices: "complete" } };
  },
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("./code-field", () => ({ CodeField: () => null }));
vi.mock("./profile-avatar", () => ({ ProfileAvatar: () => null }));
const { ProfileView } = await import("./usagemax");

beforeEach(() => { state.calls = []; state.live = undefined; });
test("history opts out of live reads and overflow is distinct from empty detail", () => {
  const html = renderToStaticMarkup(<ProfileView handle="@PUBLIC" />);
  expect(state.calls).toContainEqual({ name: "public:profileSnapshot", args: { handle: "public", days: 365, includeLive: false } });
  expect(state.calls.filter(call => call.name === "public:live")).toHaveLength(2);
  expect(html).toContain("Daily history unavailable for this volume");
  expect(html).toContain("Sources unavailable for this volume");
  expect(html).toContain("No breakdown reported yet.");
  expect(html).toContain("Loading recent public events");
  expect(html).toContain("All-time tokens");
});
test("separate live events render without requiring an internal database id", () => {
  state.live = { agents: [], events: [{ eventKey: "safe-key", eventType: "tool_call", source: "CLI", model: "model", totalTokens: 0, costMicros: 0, status: "ok", occurredAt: 1 }] };
  const html = renderToStaticMarkup(<ProfileView handle="public" />);
  expect(html).toContain("Tool Call");
  expect(html).not.toContain("Loading recent public events");
});
