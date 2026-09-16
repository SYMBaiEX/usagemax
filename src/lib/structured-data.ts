const repositoryUrl = "https://github.com/SYMBaiEX/usagemax";

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
      sameAs: [repositoryUrl],
    },
    {
      "@type": "Organization",
      "@id": "https://usagemax.com/#organization",
      name: "UsageMax",
      url: "https://usagemax.com",
      sameAs: [repositoryUrl],
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: "hello@usagemax.com",
        url: "https://usagemax.com/contact",
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
  ],
} as const;

export const usageMaxSchemaFeed = usageMaxStructuredData["@graph"].map((entry) => ({
  "@context": "https://schema.org",
  ...entry,
}));
