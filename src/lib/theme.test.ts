// @vitest-environment node
import { runInNewContext } from "node:vm";
import { describe, expect, test } from "vitest";
import { resolveTheme, themeBootstrap } from "./theme";

describe("appearance preferences", () => {
  test.each([["light", true, "light"], ["dark", false, "dark"], ["system", true, "dark"], [null, false, "light"], ["invalid", true, "dark"]])("resolves %s with OS dark=%s", (preference, systemDark, expected) => {
    expect(resolveTheme(preference, Boolean(systemDark))).toBe(expected);
  });
  test.each([false, true])("first-paint script works with blocked storage=%s", (blocked) => {
    const root = { dataset: {} as Record<string, string>, style: {} as Record<string, string> };
    runInNewContext(themeBootstrap, {
      document: { documentElement: root }, matchMedia: () => ({ matches: true }),
      localStorage: { getItem: (key: string) => { if (blocked) throw Error("storage disabled"); return key.endsWith(":theme") ? "light" : "off"; } },
    });
    expect(root.dataset.theme).toBe(blocked ? "dark" : "light");
    expect(root.style.colorScheme).toBe(root.dataset.theme);
    expect(root.dataset.motion).toBe(blocked ? "on" : "off");
  });
});
