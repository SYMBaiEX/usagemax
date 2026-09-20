const repositoryUrl = "https://github.com/SYMBaiEX/usagemax";
const logoUrl = "https://usagemax.com/brand/icon-192.png";
const registryUrl = "https://registry.modelcontextprotocol.io/v0.1/servers/io.github.SYMBaiEX%2Fusagemax/versions/latest";
// Keep this list limited to profiles and registries that are actually owned by
// or verifiably represent UsageMax. Do not add guessed social accounts: stale
// sameAs links make entity resolution less trustworthy than a shorter list.
const configuredSameAs = (process.env.USAGEMAX_ORG_SAME_AS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter((value) => /^https:\/\//i.test(value));

const sameAs = [
  repositoryUrl,
  "https://github.com/SYMBaiEX",
  "https://www.npmjs.com/package/usagemax",
  "https://www.npmjs.com/~symbaiex",
  "https://glama.ai/mcp/connectors/io.github.SYMBaiEX/usagemax",
  registryUrl,
  ...configuredSameAs,
].filter((value, index, values) => values.indexOf(value) === index);

// A postal address is only emitted when the operator supplies a complete,
// verified address in the deployment environment. Keeping this opt-in avoids
// publishing a guessed home, registered-agent, or mailbox address while still
// making the Organization schema complete for businesses that have one.
const organizationAddress = (() => {
  const streetAddress = process.env.USAGEMAX_ORG_ADDRESS_STREET?.trim();
  const addressLocality = process.env.USAGEMAX_ORG_ADDRESS_LOCALITY?.trim();
  const addressRegion = process.env.USAGEMAX_ORG_ADDRESS_REGION?.trim();
  const postalCode = process.env.USAGEMAX_ORG_ADDRESS_POSTAL_CODE?.trim();
  const addressCountry = process.env.USAGEMAX_ORG_ADDRESS_COUNTRY?.trim();

  if (!streetAddress || !addressLocality || !addressRegion || !postalCode || !addressCountry) return undefined;
  return {
    "@type": "PostalAddress",
    streetAddress,
    addressLocality,
    addressRegion,
    postalCode,
    addressCountry,
  } as const;
})();

export const usageMaxStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "@id": "https://usagemax.com/#software",
      name: "UsageMax",
      url: "https://usagemax.com",
      description: "A bounded observability layer for AI model, agent, and tool usage across connected computers.",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "macOS, Windows, Linux",
      isAccessibleForFree: true,
      codeRepository: repositoryUrl,
      downloadUrl: "https://www.npmjs.com/package/usagemax",
      softwareHelp: { "@id": "https://usagemax.com/docs" },
      releaseNotes: "https://usagemax.com/api-versioning.md",
      featureList: ["Public HTTP API", "Read-only MCP", "A2A agent", "WebMCP", "Agent Skills"],
      sameAs,
    },
    {
      "@type": "Organization",
      "@id": "https://usagemax.com/#organization",
      name: "UsageMax",
      url: "https://usagemax.com",
      description: "UsageMax is an open-source usage observability platform for people and teams building with AI.",
      logo: logoUrl,
      email: "hello@usagemax.com",
      ...(organizationAddress ? { address: organizationAddress } : {}),
      identifier: [
        { "@type": "PropertyValue", propertyID: "github", value: repositoryUrl },
        { "@type": "PropertyValue", propertyID: "npm", value: "https://www.npmjs.com/package/usagemax" },
      ],
      sameAs,
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: "hello@usagemax.com",
        url: "https://usagemax.com/contact",
        availableLanguage: "English",
      },
    },
    {
      "@type": "Service",
      "@id": "https://usagemax.com/#service",
      name: "UsageMax AI usage observability",
      serviceType: "AI usage observability",
      url: "https://usagemax.com/docs",
      description: "Bounded aggregate reporting for AI models, agents, tools, and connected computers.",
      provider: { "@id": "https://usagemax.com/#organization" },
      areaServed: "Worldwide",
      audience: { "@type": "Audience", audienceType: "AI developers and teams" },
      hasOfferCatalog: {
        "@type": "OfferCatalog",
        name: "UsageMax plans",
        url: "https://usagemax.com/pricing",
        itemListElement: [
          { "@type": "Offer", name: "Personal", price: "0", priceCurrency: "USD", url: "https://usagemax.com/pricing", description: "Free personal usage observability with no card required." },
          { "@type": "Offer", name: "Small teams", price: "0", priceCurrency: "USD", url: "https://usagemax.com/pricing", description: "Free small-team usage observability with published capacity guardrails." },
          { "@type": "Offer", name: "Enterprise", url: "https://usagemax.com/contact", description: "Enterprise capacity and controls by custom agreement." },
        ],
      },
    },
    {
      "@type": "WebAPI",
      "@id": "https://usagemax.com/#api",
      name: "UsageMax HTTP API",
      url: "https://usagemax.com/openapi.json",
      description: "Public read operations and content-free collector operations documented by the UsageMax OpenAPI contract.",
      documentation: "https://usagemax.com/docs",
      provider: { "@id": "https://usagemax.com/#organization" },
      sameAs: ["https://usagemax.com/openapi.json", "https://usagemax.com/.well-known/api-catalog", "https://usagemax.com/.well-known/ai-catalog.json", registryUrl],
    },
    {
      "@type": "WebSite",
      "@id": "https://usagemax.com/#website",
      name: "UsageMax",
      url: "https://usagemax.com",
      description: "Your AI work, made visible.",
      publisher: { "@id": "https://usagemax.com/#organization" },
      inLanguage: "en-US",
    },
    {
      "@type": "WebPage",
      "@id": "https://usagemax.com/#webpage",
      name: "UsageMax",
      url: "https://usagemax.com/",
      isPartOf: { "@id": "https://usagemax.com/#website" },
      about: { "@id": "https://usagemax.com/#software" },
      description: "Public observability for bounded AI usage telemetry.",
    },
    {
      "@type": "FAQPage",
      "@id": "https://usagemax.com/#faq",
      url: "https://usagemax.com/",
      mainEntity: [
        {
          "@type": "Question",
          name: "What does UsageMax expose publicly?",
          acceptedAnswer: { "@type": "Answer", text: "UsageMax exposes bounded aggregate usage, public profiles, rankings, and selected model and activity projections. It does not expose prompts, completions, credentials, or private workspace data." },
        },
        {
          "@type": "Question",
          name: "Does UsageMax provide an OAuth token exchange?",
          acceptedAnswer: { "@type": "Answer", text: "Yes. UsageMax delegates OAuth authorization, consent, token exchange, refresh, and revocation to its WorkOS Connect authorization server. Local collector uploads remain a separate installation-bound, write-only credential flow." },
        },
      ],
    },
    {
      "@type": "BreadcrumbList",
      "@id": "https://usagemax.com/#breadcrumbs",
      itemListElement: [{ "@type": "ListItem", position: 1, name: "UsageMax", item: "https://usagemax.com/" }],
    },
  ],
} as const;

export const usageMaxSchemaFeed = usageMaxStructuredData["@graph"].map((entry) => ({
  "@context": "https://schema.org",
  ...entry,
}));
