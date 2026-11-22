import type { components } from "./schema";

export type GatewayReceipt = components["schemas"]["GatewayReceipt"];
export type GatewayOperations = components["schemas"]["GatewayOperations"];
export type GatewayReport = components["schemas"]["GatewayReport"];
export type GatewayWriteResult = components["schemas"]["GatewayWriteResult"];
export type GatewayStatus = components["schemas"]["GatewayStatus"];

export class GatewayError extends Error {
  constructor(readonly status: number, readonly retryAfter: string | null) {
    super(`UsageMax gateway request failed (HTTP ${status}).`);
  }
}

export function createGatewayClient({
  token,
  origin = "https://usagemax.com",
  fetchImpl = fetch,
}: {
  token: string;
  origin?: string;
  fetchImpl?: typeof fetch;
}) {
  if (!/^umxg_[a-f0-9]{64}$/.test(token)) throw new TypeError("A valid UsageMax project gateway key is required.");
  const base = new URL(origin);
  if (base.protocol !== "https:" || base.username || base.password || base.pathname !== "/" || base.search || base.hash) {
    throw new TypeError("The UsageMax gateway origin must be a bare HTTPS origin.");
  }

  async function request<Response>(path: string, body?: unknown): Promise<Response> {
    const response = await fetchImpl(new URL(path, base), {
      method: body === undefined ? "GET" : "POST",
      headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new GatewayError(response.status, response.headers.get("retry-after"));
    return await response.json() as Response;
  }

  return {
    write(receipts: GatewayReceipt[]) {
      return request<GatewayWriteResult>("/api/v1/gateway/receipts", { receipts });
    },
    report({ from, through, limit }: { from: string; through: string; limit?: number }) {
      const params = new URLSearchParams({ from, through });
      if (limit !== undefined) params.set("limit", String(limit));
      return request<GatewayReport>(`/api/v1/gateway/receipts?${params}`);
    },
    operations({ from, through }: { from: string; through: string }) {
      return request<GatewayOperations>("/api/v1/gateway/operations?" + new URLSearchParams({ from, through }));
    },
    get(requestId: string) {
      if (!/^[A-Za-z0-9_-][A-Za-z0-9_.:-]{0,119}$/.test(requestId)) throw new TypeError("Invalid gateway request ID.");
      return request<{ receipt: GatewayReceipt }>(`/api/v1/gateway/receipts/${encodeURIComponent(requestId)}`);
    },
    status() {
      return request<GatewayStatus>("/api/v1/gateway/status");
    },
  };
}
