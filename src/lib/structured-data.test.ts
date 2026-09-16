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
      email: "hello@usagemax.com",
      sameAs: expect.arrayContaining([
        "https://github.com/SYMBaiEX/usagemax",
        "https://github.com/SYMBaiEX",
        "https://www.npmjs.com/package/usagemax",
      ]),
    });
    expect(organization).not.toHaveProperty("address");
  });
});
