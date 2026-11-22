import { ConvexError } from "convex/values";

import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { gatewayLimits, isGatewayRequestId, parseGatewayBatch, validateGatewayRange } from "./gatewayContract";
import type { GatewayReceipt, GatewayScope } from "./gatewayContract";
import { jsonResponse, sha256 } from "./lib";

const DETAIL_PREFIX = "/v1/gateway/receipts/";

async function keyHashFor(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!/^Bearer /i.test(authorization)) return null;
  const token = authorization.slice(7);
  return /^umxg_[a-f0-9]{64}$/.test(token) ? sha256(token) : null;
}

function errorFor(error?: unknown) {
  const data = error instanceof ConvexError ? error.data : undefined;
  if (error === undefined || data === "INVALID_GATEWAY_CREDENTIAL") {
    return jsonResponse({ error: "invalid_gateway_credential" }, 401, { "www-authenticate": "Bearer" });
  }
  if (data === "GATEWAY_SCOPE_REQUIRED") return jsonResponse({ error: "gateway_scope_required" }, 403);
  if (data === "INVALID_GATEWAY_RANGE" || data === "INVALID_GATEWAY_LIMIT") {
    return jsonResponse({ error: "invalid_gateway_range" }, 400);
  }
  if (data === "INVALID_GATEWAY_BATCH") return jsonResponse({ error: "invalid_gateway_batch" }, 400);
  if (data && typeof data === "object" && !Array.isArray(data) && "code" in data
    && data.code === "GATEWAY_RATE_LIMITED" && typeof data.retryAfter === "number") {
    return jsonResponse({ error: "rate_limited" }, 429, { "retry-after": String(data.retryAfter) });
  }
  return jsonResponse({ error: "gateway_unavailable" }, 503);
}

async function readBody(request: Request) {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > gatewayLimits.bytes)) return null;
  const reader = request.body?.getReader();
  if (!reader) return "";
  const buffer = new Uint8Array(gatewayLimits.bytes);
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, bytes));
      if (bytes + chunk.value.byteLength > gatewayLimits.bytes) {
        await reader.cancel();
        return null;
      }
      buffer.set(chunk.value, bytes);
      bytes += chunk.value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
}

export const ingestGatewayReceipts = httpAction(async (ctx, request) => {
  const keyHash = await keyHashFor(request);
  if (!keyHash) return errorFor();
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return jsonResponse({ error: "content_type_must_be_application_json" }, 415);
  }
  const body = await readBody(request).catch(() => undefined);
  if (body === null) return jsonResponse({ error: "payload_too_large" }, 413);
  let receipts: GatewayReceipt[] | null;
  try {
    receipts = body ? parseGatewayBatch(JSON.parse(body) as unknown, Date.now()) : null;
  } catch {
    receipts = null;
  }
  if (!receipts) return jsonResponse({ error: "invalid_gateway_batch" }, 400);
  try {
    const hashes = await Promise.all(receipts.map(async (receipt) => ({ receipt, payloadHash: await sha256(JSON.stringify(receipt)) })));
    const result = await ctx.runMutation(internal.gatewayReceipts.receive, { keyHash, receipts: hashes });
    return jsonResponse(result);
  } catch (error) {
    return errorFor(error);
  }
});

export const reportGatewayReceipts = httpAction(async (ctx, request) => {
  const keyHash = await keyHashFor(request);
  if (!keyHash) return errorFor();
  const params = new URL(request.url).searchParams;
  for (const key of params.keys()) {
    if (!["from", "through", "limit"].includes(key) || params.getAll(key).length > 1) {
      return jsonResponse({ error: "invalid_gateway_range" }, 400);
    }
  }
  const rawLimit = params.get("limit");
  if (rawLimit !== null && !/^\d{1,3}$/.test(rawLimit)) return jsonResponse({ error: "invalid_gateway_range" }, 400);
  try {
    const args = validateGatewayRange({
      from: params.get("from") ?? "", through: params.get("through") ?? "",
      limit: rawLimit === null ? undefined : Number(rawLimit),
    });
    const result = await ctx.runMutation(internal.gatewayReceipts.report, { keyHash, ...args });
    return jsonResponse(result);
  } catch (error) {
    return errorFor(error);
  }
});

export const reportGatewayOperations = httpAction(async (ctx, request) => {
  const keyHash = await keyHashFor(request);
  if (!keyHash) return errorFor();
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some((key) => !["from", "through"].includes(key) || params.getAll(key).length > 1)) {
    return jsonResponse({ error: "invalid_gateway_range" }, 400);
  }
  try {
    const { from, through } = validateGatewayRange({ from: params.get("from") ?? "", through: params.get("through") ?? "" });
    return jsonResponse(await ctx.runMutation(internal.gatewayOperations.report, { keyHash, from, through }));
  } catch (error) {
    return errorFor(error);
  }
});

export const gatewayReceiptDetail = httpAction(async (ctx, request) => {
  const keyHash = await keyHashFor(request);
  if (!keyHash) return errorFor();
  let requestId: string;
  try {
    requestId = decodeURIComponent(new URL(request.url).pathname.slice(DETAIL_PREFIX.length));
  } catch {
    return jsonResponse({ error: "gateway_receipt_not_found" }, 404);
  }
  if (!isGatewayRequestId(requestId)) return jsonResponse({ error: "gateway_receipt_not_found" }, 404);
  try {
    const result = await ctx.runMutation(internal.gatewayReceipts.detail, { keyHash, requestId });
    return result ? jsonResponse(result) : jsonResponse({ error: "gateway_receipt_not_found" }, 404);
  } catch (error) {
    return errorFor(error);
  }
});

export const gatewayCredentialStatus = httpAction(async (ctx, request) => {
  const keyHash = await keyHashFor(request);
  if (!keyHash) return errorFor();
  try {
    const status: { ok: true; scope: GatewayScope; lastSuccessAt: number | null } = await ctx.runQuery(internal.gatewayCredentials.status, { keyHash });
    return jsonResponse(status);
  } catch (error) {
    return errorFor(error);
  }
});
