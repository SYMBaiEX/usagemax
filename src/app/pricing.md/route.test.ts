import { describe, expect, it } from "vitest";
import { GET, HEAD } from "./route";

describe("pricing resource", () => {
  it("publishes explicit free tiers and truthful enterprise boundaries", async () => {
    const response = GET();
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    const body = await response.text();
    expect(body).toContain("Personal — $0/month");
    expect(body).toContain("Small teams — $0/month");
    expect(body).toContain("Enterprise — custom agreement");
    expect(body).toContain("Up to 10 members");
    expect(body).toContain("no trial clock");
    expect(body).toContain("Prompts, completions, source code");
    expect(body).toContain("plan_id: personal");
    expect(body).toContain("price: 0 USD/month");
    expect(body).toContain("plan_id: enterprise");
    expect(body).toContain("price: custom_agreement");
    expect(body).toContain("billing: written_agreement_before_activation");
    expect(body).toContain("## Feature and limit matrix");
    expect(body).toContain("SSO and directory provisioning");
    expect(body).toContain("Governed exports and SIEM delivery");
    expect(body).toContain("## Definitions used in this pricing document");
    expect(body).toContain("## Plan tiers, prices, features, and limits");
    expect(body).toContain("## Example plan decisions");
    expect(body).toContain("## Enterprise procurement questions");
    expect(body).toContain("## Cost and accounting definitions");
    expect(body.split("\n").filter(Boolean).length).toBeGreaterThan(350);
    expect(body).not.toContain("$99");
  });

  it("supports a cacheable HEAD request", () => {
    expect(HEAD().status).toBe(200);
    expect(HEAD().headers.get("content-type")).toBe("text/markdown; charset=utf-8");
  });
});
