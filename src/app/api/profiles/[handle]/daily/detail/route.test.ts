// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";
import { ConvexError } from "convex/values";
const fetchQuery = vi.hoisted(() => vi.fn());
vi.mock("convex/nextjs", () => ({ fetchQuery }));
import { GET } from "./route";
import { GET as legacyGET } from "../route";
const context = { params: Promise.resolve({ handle: "public" }) };
beforeEach(() => { fetchQuery.mockReset(); });
test("rejects invalid dates and page sizes before querying", async () => {
  for (const query of ["from=2026-02-30&through=2026-03-01", "from=2026-09-01&through=2026-09-02&limit=501", "from=2026-09-03&through=2026-09-02"]) {
    expect((await GET(new Request("https://test/daily/detail?" + query), context)).status).toBe(400);
  }
  expect(fetchQuery).not.toHaveBeenCalled();
});
test("passes cursor and scan bounds; returns native pagination metadata without caching", async () => {
  fetchQuery.mockResolvedValue({ page: [{ date: "2026-09-01", key: "Device 1", totalTokens: 10 }], isDone: false, continueCursor: "next", splitCursor: "split", pageStatus: "SplitRecommended" });
  const response = await GET(new Request("https://test/daily/detail?from=2026-09-01&through=2026-09-02&groupBy=device&cursor=previous&limit=20"), context);
  expect(fetchQuery.mock.calls[0][1]).toMatchObject({ groupBy: "device", paginationOpts: { cursor: "previous", numItems: 20, maximumRowsRead: 500, maximumBytesRead: 1000000 } });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toMatchObject({ isDone: false, continueCursor: "next", splitCursor: "split", pageStatus: "SplitRecommended", aggregation: "additive_rows", consistentSnapshot: false });
});
test.each(["InvalidCursor: secret backend context", "Failed to parse pagination cursor: secret backend context"])("sanitizes malformed cursor failures: %s", async message => {
  fetchQuery.mockImplementation(async () => { throw new Error(message); });
  const response = await GET(new Request("https://test/daily/detail?from=2026-09-01&through=2026-09-02&cursor=private-invalid-value"), context);
  expect(response.status).toBe(400);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ error: "invalid_pagination_cursor" });
});
test("unrelated backend errors are sanitized and not misclassified as cursor errors", async () => {
  fetchQuery.mockImplementation(async () => { throw new Error("secret backend unavailable"); });
  const response = await GET(new Request("https://test/daily/detail?from=2026-09-01&through=2026-09-02&cursor=previous"), context);
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "public_detail_unavailable" });
});
test("legacy overflow maps to a non-cacheable explicit response", async () => {
  fetchQuery.mockImplementation(async () => { throw new ConvexError({ code: "PUBLIC_DETAIL_LIMIT" }); });
  const response = await legacyGET(new Request("https://test/daily?groupBy=model"), context);
  expect(response.status).toBe(422);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const body = await response.json();
  expect(body).toMatchObject({
    error: "PUBLIC_DETAIL_LIMIT",
    pagination: { href: "/api/profiles/public/daily/detail?groupBy=model", requiredParameters: ["from", "through"] },
  });
});
