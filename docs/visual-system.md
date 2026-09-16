# UsageMax visual system

Two compositions share one semantic contract: warm ivory/forest/vermilion in light mode, graphite/cyan/amber in dark mode. Depth comes from material, lighting and type hierarchy—not separator lines around every section.

## Ownership

- `src/styles/tokens.css`: palette, text roles, radii, elevation and chart colors for both themes.
- `src/app/globals.css`: explicit import order only.
- `src/styles/`: shared base controls, navigation, public data surfaces, content pages, account and responsive rules.
- `src/app/themes.css`: intentional composition differences, artwork switching and shared theme controls. Do not redeclare the palette here.
- Component CSS modules: unique layouts and illustrations. Consume semantic tokens for shared material; keep illustration-specific colors local.

`--surface-card` and `--surface-inset` are background images, not colors. Use `--paper-raised`, `--paper-deep` or `--surface-tint` in `color-mix()` and gradient stops. Use `--shadow-card` for contained data, `--shadow-float` for a focal object and `--shadow-inset` for recessed controls. Glow is reserved for accents, not body text.

Meaningful captions have an 11px floor; labels and controls use 12px where space permits. Dense data remains tabular and horizontally scrollable on narrow screens. Chart colors resolve through CSS variables so the same series keeps its identity across themes.

## Motion and accessibility

There is no global play/pause control. Decorative entrance motion settles within five seconds; interactions may animate briefly. Existing saved motion-off preferences remain honored, and OS reduced-motion overrides all animation. No new render loop, canvas, polling or dependency is needed for the material treatment.

`src/lib/visual-contract.test.ts` checks core text/button/chart contrast pairs and finite ambient motion. Browser acceptance must still cover both themes, mobile layout, keyboard focus, real populated charts and the interactive teams/accounting previews. Static tests are not a substitute for rendered review.
