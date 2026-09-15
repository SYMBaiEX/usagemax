"use node";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ConvexError, v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { accessReference } from "./account";
import { provider } from "./connections";
import { addMoney, centsToMicros, nextDay } from "./providerMath";

function encryptionKey() {
  const value = process.env.PROVIDER_ENCRYPTION_KEY;
  if (!value || !/^[a-f0-9]{64}$/i.test(value))
    throw new ConvexError("PROVIDER_VAULT_NOT_CONFIGURED");
  return Buffer.from(value, "hex");
}

export const connect = action({
  args: {
    provider,
    name: v.string(),
    accountId: v.string(),
    startDay: v.string(),
    credential: v.string(),
  },
  handler: async (ctx, args): Promise<{ connected: boolean }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("AUTH_REQUIRED");
    await ctx.runMutation(internal.rateLimits.consumeManagementAttempt, {});
    const reference = accessReference(identity);
    const access = await ctx.runQuery(internal.connections.authorize, {
      access: reference,
    });
    if (
      !args.credential.trim() ||
      args.credential.length > 4096 ||
      /[\r\n]/.test(args.credential)
    )
      throw new ConvexError("INVALID_CREDENTIAL");
    if (
      args.provider === "github" &&
      !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(args.accountId)
    )
      throw new ConvexError("INVALID_GITHUB_ORGANIZATION");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
    cipher.setAAD(
      Buffer.from(`${access.workspaceId}:${args.provider}:${args.accountId}`),
    );
    const ciphertext = Buffer.concat([
      cipher.update(args.credential.trim(), "utf8"),
      cipher.final(),
      cipher.getAuthTag(),
    ]);
    await ctx.runMutation(internal.connections.store, {
      access: reference,
      provider: args.provider,
      name: args.name,
      accountId: args.accountId,
      startDay: args.startDay,
      secretCiphertext: ciphertext.toString("base64"),
      secretIv: iv.toString("base64"),
      keyVersion: "v1",
    });
    return { connected: true };
  },
});

async function providerJson(
  url: string,
  init: RequestInit,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  // URLs are built from fixed provider origins, never supplied by users or response data.
  const response = await fetch(url, { ...init, redirect: "error", signal });
  if (!response.ok) throw new Error(`PROVIDER_HTTP_${response.status}`);
  if (Number(response.headers.get("content-length") ?? 0) > 4_000_000)
    throw new Error("PROVIDER_RESPONSE_TOO_LARGE");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("INVALID_PROVIDER_RESPONSE");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4_000_000) throw new Error("PROVIDER_RESPONSE_TOO_LARGE");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new Error("INVALID_PROVIDER_RESPONSE");
  return body as Record<string, unknown>;
}

export const sync = internalAction({
  args: { id: v.id("providerConnections"), leaseId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.runQuery(internal.connections.leased, args);
    if (!row) return;
    const day = row.syncDay ?? new Date().toISOString().slice(0, 10);
    try {
      if (row.keyVersion !== "v1") throw new Error("UNKNOWN_VAULT_KEY_VERSION");
      const encrypted = Buffer.from(row.secretCiphertext, "base64");
      const decipher = createDecipheriv(
        "aes-256-gcm",
        encryptionKey(),
        Buffer.from(row.secretIv, "base64"),
      );
      decipher.setAAD(
        Buffer.from(`${row.workspaceId}:${row.provider}:${row.accountId}`),
      );
      decipher.setAuthTag(encrypted.subarray(-16));
      const secret = Buffer.concat([
        decipher.update(encrypted.subarray(0, -16)),
        decipher.final(),
      ]).toString("utf8");
      const signal = AbortSignal.timeout(25_000);
      let costMicros: number | undefined;
      let seats: number | undefined;
      if (row.provider === "anthropic") {
        const url = new URL(
          "https://api.anthropic.com/v1/organizations/cost_report",
        );
        url.searchParams.set("starting_at", `${day}T00:00:00Z`);
        url.searchParams.set("ending_at", `${nextDay(day)}T00:00:00Z`);
        url.searchParams.set("limit", "1");
        const json = await providerJson(
          url.toString(),
          {
            headers: { "x-api-key": secret, "anthropic-version": "2023-06-01" },
          },
          signal,
        );
        if (!Array.isArray(json.data) || json.has_more === true)
          throw new Error("INCOMPLETE_PROVIDER_REPORT");
        costMicros = 0;
        for (const bucket of json.data) {
          if (
            !bucket ||
            typeof bucket !== "object" ||
            !Array.isArray(bucket.results) ||
            String(bucket.starting_at).slice(0, 10) !== day
          )
            throw new Error("INVALID_PROVIDER_REPORT");
          for (const result of bucket.results) {
            if (result.currency !== "USD")
              throw new Error("UNSUPPORTED_PROVIDER_CURRENCY");
            costMicros = addMoney(costMicros, centsToMicros(result.amount));
          }
        }
      } else if (row.provider === "cursor") {
        const page = row.syncPage ?? 1;
        const json = await providerJson(
          "https://api.cursor.com/teams/filtered-usage-events",
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${Buffer.from(`${secret}:`).toString("base64")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              startDate: Date.parse(`${day}T00:00:00Z`),
              endDate: Date.parse(`${nextDay(day)}T00:00:00Z`) - 1,
              page,
              pageSize: 500,
            }),
          },
          signal,
        );
        if (
          !Array.isArray(json.usageEvents) ||
          !json.pagination ||
          typeof json.pagination !== "object"
        )
          throw new Error("INVALID_PROVIDER_REPORT");
        const expected = Number(json.totalUsageEventsCount);
        if (
          !Number.isSafeInteger(expected) ||
          expected < 0 ||
          (row.syncExpected !== undefined && expected !== row.syncExpected)
        )
          throw new Error("REPORT_CHANGED_DURING_IMPORT_RECONNECT");
        const pagination = json.pagination as {
          currentPage?: number;
          hasNextPage?: boolean;
        };
        if (
          pagination.currentPage !== page ||
          typeof pagination.hasNextPage !== "boolean"
        )
          throw new Error("INVALID_PROVIDER_PAGINATION");
        const seen = (row.syncSeen ?? 0) + json.usageEvents.length;
        if (
          seen > expected ||
          (pagination.hasNextPage && !json.usageEvents.length) ||
          (!pagination.hasNextPage && seen !== expected)
        )
          throw new Error("INCOMPLETE_PROVIDER_REPORT");
        costMicros = row.syncAmountMicros ?? 0;
        for (const event of json.usageEvents) {
          if (typeof event.isChargeable !== "boolean")
            throw new Error("MISSING_CHARGE_CLASSIFICATION");
          if (event.isChargeable)
            costMicros = addMoney(
              costMicros,
              centsToMicros(event.chargedCents),
            );
        }
        await ctx.runMutation(internal.connections.finish, {
          ...args,
          day,
          costMicros,
          page,
          seen,
          expected,
          hasMore: pagination.hasNextPage,
        });
        return;
      } else {
        const json = await providerJson(
          `https://api.github.com/orgs/${encodeURIComponent(row.accountId)}/copilot/billing/seats?per_page=1`,
          {
            headers: {
              Authorization: `Bearer ${secret}`,
              Accept: "application/vnd.github+json",
              "X-GitHub-Api-Version": "2022-11-28",
              "User-Agent": "UsageMax",
            },
          },
          signal,
        );
        seats = Number(json.total_seats);
        if (!Number.isSafeInteger(seats) || seats < 0)
          throw new Error("INVALID_PROVIDER_REPORT");
      }
      await ctx.runMutation(internal.connections.finish, {
        ...args,
        day,
        costMicros,
        seats,
      });
    } catch (error) {
      const candidate = error instanceof Error ? error.message : "";
      const safeError = /^[A-Z][A-Z_0-9]{2,90}$/.test(candidate)
        ? candidate
        : "PROVIDER_SYNC_FAILED_CHECK_CREDENTIAL_AND_ACCESS";
      await ctx.runMutation(internal.connections.finish, {
        ...args,
        day,
        error: safeError,
      });
    }
  },
});
