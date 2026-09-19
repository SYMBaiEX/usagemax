import { describe, expect, test } from "vitest";

import { usageMaxStructuredData } from "./structured-data";

describe("UsageMax structured data", () => {
  test("publishes a complete factual Organization identity without an invented address", () => {
    const organization = usageMaxStructuredData["@graph"].find((entry) => entry["@type"] === "Organization");

    expect(organization).toMatchObject({
      "@id": "https://usagemax.com/#organization",
      name: "UsageMax",
      url: "https://usagemax.com",
      description: expect.stringContaining("open-source usage observability platform"),
      logo: "https://usagemax.com/brand/icon-192.png",
      contactPoint: { "@type": "ContactPoint", url: "https://usagemax.com/contact", availableLanguage: "English" },
      email: "hello@usagemax.com",
      identifier: expect.arrayContaining([
        expect.objectContaining({ propertyID: "github", value: "https://github.com/SYMBaiEX/usagemax" }),
        expect.objectContaining({ propertyID: "npm", value: "https://www.npmjs.com/package/usagemax" }),
      ]),
      sameAs: expect.arrayContaining([
        "https://github.com/SYMBaiEX/usagemax",
        "https://github.com/SYMBaiEX",
        "https://www.npmjs.com/package/usagemax",
        "https://www.npmjs.com/~symbaiex",
        "https://glama.ai/mcp/connectors/io.github.SYMBaiEX/usagemax",
        "https://registry.modelcontextprotocol.io/v0.1/servers/io.github.SYMBaiEX%2Fusagemax/versions/latest",
      ]),
    });
    expect(organization).not.toHaveProperty("address");
  });

  test("exposes factual developer authority and documentation links", () => {
    const software = usageMaxStructuredData["@graph"].find((entry) => entry["@type"] === "SoftwareApplication");
    const service = usageMaxStructuredData["@graph"].find((entry) => entry["@type"] === "Service");

    expect(software).toMatchObject({
      isAccessibleForFree: true,
      codeRepository: "https://github.com/SYMBaiEX/usagemax",
      downloadUrl: "https://www.npmjs.com/package/usagemax",
      softwareHelp: { "@id": "https://usagemax.com/docs" },
      featureList: expect.arrayContaining(["Read-only MCP", "A2A agent", "Agent Skills"]),
    });
    expect(service).toMatchObject({ hasOfferCatalog: { url: "https://usagemax.com/pricing", itemListElement: expect.arrayContaining([
      expect.objectContaining({ "@type": "Offer", name: "Personal", price: "0", priceCurrency: "USD" }),
      expect.objectContaining({ "@type": "Offer", name: "Small teams", price: "0", priceCurrency: "USD" }),
    ]) } });
    expect(usageMaxStructuredData["@graph"]).toContainEqual(expect.objectContaining({
      "@type": "WebAPI",
      "@id": "https://usagemax.com/#api",
      url: "https://usagemax.com/openapi.json",
      sameAs: expect.arrayContaining(["https://usagemax.com/.well-known/api-catalog", "https://usagemax.com/.well-known/ai-catalog.json", "https://registry.modelcontextprotocol.io/v0.1/servers/io.github.SYMBaiEX%2Fusagemax/versions/latest"]),
    }));
  });
});
