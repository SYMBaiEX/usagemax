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
      codeRepository: repositoryUrl,
      downloadUrl: "https://www.npmjs.com/package/usagemax",
      softwareHelp: { "@id": "https://usagemax.com/docs" },
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
      sameAs,
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: "hello@usagemax.com",
        url: "https://usagemax.com/contact",
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
      },
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
