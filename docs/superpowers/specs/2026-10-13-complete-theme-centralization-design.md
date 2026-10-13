# Complete Theme Centralization

- Status: approved
- Date: 2026-10-13
- Scope: every application page and stylesheet in the shared Nexora prototype and production web application

## Outcome

Complete the existing System, Light, and Dark theme architecture by removing independent component palettes from every application surface. All application color and typography decisions become centrally owned, while existing functionality, layout, permissions, authentication, APIs, forms, navigation, and workflows remain unchanged.

Print and legal document canvases remain white paper with dark ink in every appearance mode. Those fixed values are still centralized as semantic document tokens rather than remaining as component literals.

## Ownership Boundaries

`theme-colors.css` is the sole owner of application color values. It defines Light and Dark values for surfaces, text, borders, navigation, brand treatments, statuses, controls, focus indicators, overlays, charts, visualizations, and document presentation. Fixed paper and ink tokens deliberately receive identical values in both themes.

`typography.css` is the sole owner of font families and type-scale variables. Components consume the font tokens and do not reference framework font variables or hard-coded font stacks directly.

`tokens.css` contains non-color design tokens only: dimensions, spacing-related geometry, radii, elevation composition, density, and motion.

Component CSS and style-bearing TS/TSX may consume semantic variables, `currentColor`, `transparent`, variable-based `color-mix()`, and operating-system forced-color keywords. They may not define hexadecimal, RGB, HSL, or independent Light/Dark palettes.

## Migration Strategy

Every remaining literal is classified by meaning before replacement:

- application surfaces, text, and rules use the shared surface, text, and border families;
- navigation and branded controls use brand and sidebar tokens;
- statuses and validation use success, warning, danger, info, and neutral families;
- categorical and ordinal visualizations use the centralized chart palette and matching foreground tokens;
- documents and print output use fixed paper, ink, rule, signature, and stamp tokens;
- shadows, overlays, and decorative glows use centralized translucent tokens.

Existing tokens are reused when their semantics and contrast are correct. A new token is introduced only when reusing an existing token would conflate meanings or cause a visual or accessibility regression. Migration proceeds in focused stylesheet groups and preserves selector order to avoid unrelated formatting churn.

The existing root `ThemeProvider` remains the only preference owner. Components do not read storage, watch media queries, or introduce route-specific theme state. The document-level resolved theme continues to drive all pages through inherited semantic tokens.

## Compatibility and Failure Handling

The existing `system | light | dark` storage contract, legacy preference migration, pre-hydration initialization, and system media-query listener remain unchanged.

All referenced variables must be defined for both Light and Dark. Missing or invalid browser storage continues to resolve safely to System. A styling failure must not interrupt authentication, authorization, navigation, form state, API requests, or other business behavior.

Forced-colors support remains intact because operating-system accessibility colors are not application palette values.

## Accessibility

Normal text and interactive controls must meet WCAG AA contrast in both Light and Dark. Status meaning remains accompanied by text or icons. Focus indicators remain visible on every surface. Chart fills that carry text use centralized, tone-specific foreground tokens. Fixed document previews retain paper-like contrast regardless of application appearance.

## Verification

Automated gates will verify:

- no color literals remain in component CSS or style-bearing application source outside `theme-colors.css`;
- Light and Dark define the same required semantic token set;
- component font declarations consume centralized typography tokens;
- every referenced theme token is defined;
- System, Light, and Dark persistence and operating-system switching continue to work;
- representative Login, Identity, User Management, prototype, form, dialog, chart, and document surfaces pass WCAG A/AA checks in both themes;
- existing unit, design-system, legacy, and browser tests remain green;
- type checking, linting, formatting, and production builds pass.

The enforcement test reports the exact file and declaration for any new literal or undefined token. Document and print colors are validated as centralized fixed tokens, not allowlisted component exceptions.

## Acceptance Criteria

- Every interactive app and page is controlled by the one global theme preference.
- `theme-colors.css` is the only application color-value source.
- `typography.css` is the only font-family and type-scale source.
- Component styles contain no independent palettes or theme-specific values.
- Fixed print and legal document presentation remains visually stable through centralized document tokens.
- Light and Dark meet the tested accessibility requirements without changing application behavior.
- Automated architecture gates prevent decentralized colors and fonts from returning.
