import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { DAY_MS, dayFromTimestamp } from "./lib";
import { officialPricingSources, type CatalogProvider } from "./officialPriceCatalog";
import type { VerifiedRateCard } from "./verifiedModelPricing";

export async function officialCatalogForDay(
  ctx: QueryCtx,
  provider: CatalogProvider,
  day: string,
  now: number,
) {
  if (day > dayFromTimestamp(now)) return null;
  const health = await ctx.db.query("officialPricingHealth")
    .withIndex("by_provider", (q) => q.eq("provider", provider)).unique();
  const catalog = await ctx.db.query("officialPricingCatalogs")
    .withIndex("by_provider_and_effectiveDay", (q) => q.eq("provider", provider).lte("effectiveDay", day))
    .order("desc").first();
  if (!catalog) return undefined;
  return health?.lastSuccessAt && now - health.lastSuccessAt <= 3 * DAY_MS ? catalog : null;
}

export function officialRateCard(
  catalog: Doc<"officialPricingCatalogs"> | null | undefined,
  model: string,
  day: string,
): VerifiedRateCard | null | undefined {
  if (!catalog) return catalog;
  const entry = catalog.models.find((row) => row.model === model);
  if (!entry || day < catalog.effectiveDay || (entry.through && day > entry.through)) return null;
  const { standard, context, through } = entry;
  return {
    from: catalog.effectiveDay,
    through,
    standard,
    context,
    pricingSource: officialPricingSources[catalog.provider].pricingSource,
    pricingVersion: `official-observed-v1:${catalog.provider}:${catalog.effectiveDay}:${catalog.revision.slice(0, 16)}`,
  };
}
