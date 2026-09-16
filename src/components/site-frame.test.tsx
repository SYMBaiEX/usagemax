// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { SiteFrame } from "./site-frame";
const state = vi.hoisted(() => ({ path: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.path }));
test("public page keeps footer after main in a measurable dock", () => {
  state.path = "/";
  const html = renderToStaticMarkup(<SiteFrame header={<header>Header</header>} footer={<footer>Footer</footer>}>Content</SiteFrame>);
  expect(html).toContain('</main><div class="footer-dock"><footer>Footer</footer></div>');
  // Without JS the safe default is ordinary flow, never hidden links.
  expect(html).not.toContain('data-dockable="true"');
});
test.each(["/sign-in", "/sign-up"])("auth layout omits the dock: %s", path => {
  state.path = path;
  const html = renderToStaticMarkup(<SiteFrame header={<header>Header</header>} footer={<footer>Footer</footer>}>Content</SiteFrame>);
  expect(html).not.toContain("footer-dock");
  expect(html).not.toContain("<header");
});
