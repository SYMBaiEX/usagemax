// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { ProfileAvatar } from "./profile-avatar";
import { CodeField } from "./code-field";

describe("lightweight identity and ambience", () => {
  test("Facehash is deterministic, local, and normalizes the stable handle", () => {
    const html = renderToStaticMarkup(<ProfileAvatar handle=" Builder " />);
    expect(html).toBe(renderToStaticMarkup(<ProfileAvatar handle="builder" />));
    expect(html).toContain("data-facehash");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("animation:");
    expect(html).toContain('aria-hidden="true"');
  });
  test("ambient code is decorative, paused by default, and not a fake live log", () => {
    const html = renderToStaticMarkup(<CodeField />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-running="false"');
    expect(html).not.toContain('aria-live');
    expect(html).not.toContain('<canvas');
  });
});
