// @vitest-environment node
import type { AnchorHTMLAttributes } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { TeamsShowcase } from "./teams-showcase";
import { CountingWorkbench } from "./counting-workbench";

vi.mock("next/link", () => ({ default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} /> }));

describe("product illustrations", () => {
  test.each(["home", "page"] as const)("%s workspace labels sample data and has working destinations", (variant) => {
    const html = renderToStaticMarkup(<TeamsShowcase variant={variant} />);
    expect(html).toContain("Example data");
    expect(html).toContain('aria-label="Workspace preview"');
    expect(html).toContain('aria-label="Usage example"');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/aria-controls=/g)).toHaveLength(3);
    expect(html).toContain(variant === "home" ? 'href="/enterprise"' : 'href="/security"');
    expect(html).not.toContain('href="#"');
    for (const value of ["4.8M", "3.7M", "1.5M"]) expect(html).toContain(value);
    expect(html).not.toContain("cta-light.webp");
    expect(html).not.toContain("cta-dark.webp");
    expect(html).toContain("Workspace preview");
  });

  test("accounting workbench is usable without javascript and labels the example", () => {
    const html = renderToStaticMarkup(<CountingWorkbench />);
    expect(html).toContain("Interactive example");
    expect(html).toContain("Illustrative payload");
    expect(html).toContain('aria-label="Complete event payload"');
    expect(html).toContain('aria-label="Complete accounting result"');
    expect(html).toContain("Unknown");
    expect(html).toContain("No price supplied");
    expect(html).toContain("2,000");
    expect(html).toContain('role="status"');
    expect(html.match(/aria-controls=/g)).toHaveLength(3);
  });
});
