// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const tokens = readFileSync(new URL("../styles/tokens.css", import.meta.url), "utf8");
function palette(dark: boolean) {
  const selector = dark ? ':root[data-theme="dark"]' : ":root";
  const block = tokens.slice(tokens.indexOf(`${selector} {`)).split("}")[0];
  return Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*(#[a-f\d]{6});/gi)].map(match => [match[1], match[2]]));
}
function luminance(hex: string) {
  const rgb = hex.slice(1).match(/../g)!.map(value => parseInt(value, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
function contrast(a: string, b: string) {
  const light = Math.max(luminance(a), luminance(b));
  const dark = Math.min(luminance(a), luminance(b));
  return (light + .05) / (dark + .05);
}

describe.each([false, true])("visual color contract, dark=%s", dark => {
  const p = palette(dark);
  test.each(["--paper", "--paper-raised", "--paper-deep", "--surface-tint"])("text remains readable on %s", surface => {
    for (const ink of ["--ink", "--ink-soft", "--ink-faint"]) {
      expect(contrast(p[ink], p[surface]), `${ink} on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  test("primary and hover buttons meet normal-text contrast", () => {
    for (const bg of ["--button-bg", "--button-hover"]) expect(contrast(p["--button-text"], p[bg])).toBeGreaterThanOrEqual(4.5);
  });
  test("keyboard focus contrasts with base and inverse surfaces", () => {
    expect(contrast(p["--focus-ring"], p["--paper"])).toBeGreaterThanOrEqual(3);
    for (const background of [p["--footer-bg"], "#173d31", "#183e33"]) {
      expect(contrast(p["--focus-ring-inverse"], background)).toBeGreaterThanOrEqual(3);
    }
  });
  test("chart series remain distinguishable from their data surfaces", () => {
    for (const color of ["--chart-series-1", "--chart-series-2", "--chart-series-3", "--chart-series-4"]) {
      expect(contrast(p[color], p["--paper-raised"]), color).toBeGreaterThanOrEqual(3);
    }
  });
});

test("ambient motion continues without playback controls and respects reduced motion", () => {
  const control = readFileSync(new URL("../components/theme-controls.tsx", import.meta.url), "utf8");
  expect(control).not.toContain("motion-toggle");
  for (const file of ["auth-page.module.css", "code-field.module.css"]) {
    const css = readFileSync(new URL(`../components/${file}`, import.meta.url), "utf8");
    expect(css).toMatch(/animation:[^;]*infinite/);
    expect(css).toContain("prefers-reduced-motion: reduce");
  }
  const responsive = readFileSync(new URL("../styles/responsive.css", import.meta.url), "utf8");
  expect(responsive).toContain("prefers-reduced-motion: reduce");
});

test("profile hero type cannot leak into nested chart tooltips", () => {
  for (const file of ["../styles/data-surfaces.css", "../styles/responsive.css", "../app/themes.css"]) {
    const css = readFileSync(new URL(file, import.meta.url), "utf8");
    expect(css).not.toContain(".profile-chart-total strong");
    expect(css).toContain(".profile-chart-total > strong");
  }
});
