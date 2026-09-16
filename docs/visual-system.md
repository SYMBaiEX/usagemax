# UsageMax visual system

Two compositions share one semantic contract: warm ivory and vermilion in light mode, charcoal and luminous orange in dark mode. Neutral surfaces keep orange as the brand accent; green is reserved for status. Depth comes from hierarchy and restrained elevation—not separator lines or ornamental frames. Teams leads with an interactive product preview, not a decorative pedestal.

## Ownership

- `src/styles/tokens.css`: palette, text roles, radii, elevation and chart colors for both themes.
- `src/app/globals.css`: explicit import order only.
- `src/styles/`: shared base controls, navigation, public data surfaces, content pages, account and responsive rules.
- `src/app/themes.css`: intentional composition differences, artwork switching and shared theme controls. Do not redeclare the palette here.
- Component CSS modules: unique layouts and illustrations. Consume semantic tokens for shared material; keep illustration-specific colors local.

`--surface-card` and `--surface-inset` are background images, not colors. Use `--paper-raised`, `--paper-deep` or `--surface-tint` in `color-mix()` and gradient stops. Use `--shadow-card` for contained data, `--shadow-float` for a focal object and `--shadow-inset` for recessed controls. Glow is reserved for accents, not body text.

Meaningful captions have an 11px floor; labels and controls use 12px where space permits. Dense data remains tabular and horizontally scrollable on narrow screens. Chart colors resolve through CSS variables so the same series keeps its identity across themes.

## Motion and accessibility

There is no global play/pause control. Ambient code scrolls continuously while visible; the auth ribbon floats slowly. Obsolete saved pause settings are ignored. OS reduced-motion disables these effects. MotionSurface reveals a section once on intersection and uses native scroll timelines for subtle desktop parallax where supported. Content remains visible without JavaScript. There is no animation dependency, polling, or per-frame React rendering.

`src/lib/visual-contract.test.ts` checks core text/button/chart contrast pairs and continuous, reduced-motion-aware animation. Numeric rows use tabular figures, right-aligned dedicated columns, and inset padding. Summary type scales to its container. Browser acceptance must still cover both themes, mobile layout, keyboard focus, real populated charts and the interactive teams/accounting previews. Static tests are not a substitute for rendered review.
