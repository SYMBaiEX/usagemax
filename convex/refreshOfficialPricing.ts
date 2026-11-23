import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { officialPricingSources, parseOfficialRateCatalog } from "./officialPriceCatalog";
import type { CatalogProvider } from "./officialPriceCatalog";
import { pricingFailure, pricingProvider } from "./officialPricingSchema";

type RefreshResult = {
  provider: CatalogProvider;
  changed: boolean;
  modelCount?: number;
  error?: typeof pricingFailure.type;
};

const maxDocumentBytes = 256_000;

async function pricingMarkdown(url: string): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(12_000), redirect: "error",
    headers: { accept: "text/markdown" },
  });
  if (!response.ok || !response.headers.get("content-type")?.startsWith("text/markdown")
    || Number(response.headers.get("content-length") ?? 0) > maxDocumentBytes || !response.body)
    throw new Error("pricing_document_unavailable");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let markdown = "";
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return markdown + decoder.decode();
      bytes += value.byteLength;
      if (bytes > maxDocumentBytes) throw new Error("pricing_document_too_large");
      markdown += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

async function revisionFor(models: ReturnType<typeof parseOfficialRateCatalog>) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(models)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const refresh = internalAction({
  args: {},
  returns: v.array(v.object({
    provider: pricingProvider,
    changed: v.boolean(),
    modelCount: v.optional(v.number()),
    error: v.optional(pricingFailure),
  })),
  handler: async (ctx): Promise<RefreshResult[]> => {
    const observedAt = Date.now();
    const providers: CatalogProvider[] = ["openai", "anthropic"];
    return Promise.all(providers.map(async (provider) => {
      let reason: typeof pricingFailure.type = "source_unavailable";
      let models: ReturnType<typeof parseOfficialRateCatalog>;
      try {
        const markdown = await pricingMarkdown(officialPricingSources[provider].markdownUrl);
        reason = "invalid_source";
        models = parseOfficialRateCatalog(provider, markdown);
      } catch {
        await ctx.runMutation(internal.officialPricing.recordFailure, { provider, observedAt, reason });
        return { provider, changed: false, error: reason };
      }
      const revision = await revisionFor(models);
      const changed = await ctx.runMutation(internal.officialPricing.recordObservation, {
        provider, observedAt, revision, models,
      });
      return { provider, changed, modelCount: models.length };
    }));
  },
});
