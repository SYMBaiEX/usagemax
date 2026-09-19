const repositoryUrl = "https://github.com/SYMBaiEX/usagemax";
const logoUrl = "https://usagemax.com/brand/icon-192.png";
const registryUrl = "https://registry.modelcontextprotocol.io/v0.1/servers/io.github.SYMBaiEX%2Fusagemax/versions/latest";
const sameAs = [repositoryUrl, "https://github.com/SYMBaiEX", "https://www.npmjs.com/package/usagemax", registryUrl];

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
          acceptedAnswer: { "@type": "Answer", text: "No. UsageMax currently uses an installation-bound, write-only collector credential and does not provide a general OAuth authorization-server exchange." },
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
