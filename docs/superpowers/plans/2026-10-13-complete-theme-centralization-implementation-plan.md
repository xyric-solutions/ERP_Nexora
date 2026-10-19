# Complete Theme Centralization — Implementation Plan

## Objective

Make the centralized theme files the only source of application colors and typography across every production and prototype page, while preserving fixed paper presentation, current layouts, and all business behavior.

## Phase 1 — Architecture gates and inventory

1. Extend the design-system tests to fail on color literals in component CSS and style-bearing TS/TSX.
2. Add token-integrity checks for undefined references and Light/Dark token parity.
3. Add a typography gate that rejects non-token font-family declarations outside `typography.css`.
4. Run the gates in their expected failing state and capture the remaining files.

## Phase 2 — Central semantic palette

1. Classify remaining colors into surface, text, border, navigation, status, document, overlay, visualization, and decorative roles.
2. Reuse existing semantic tokens where meaning and contrast match.
3. Add narrowly named tokens for meanings not currently represented.
4. Define all appearance-dependent tokens in both Light and Dark.
5. Define fixed paper and print tokens identically in both themes.

## Phase 3 — Shared shell and workspace migration

1. Migrate `prototype-extra.css` and shared form/workspace styles.
2. Migrate AI, intelligence, document, commerce, banking, and transaction-control styles.
3. Replace direct framework font use with centralized typography tokens.
4. Preserve forced-colors system keywords and variable-based `color-mix()`.

## Phase 4 — Domain page migration

1. Migrate HR and lifecycle styles.
2. Migrate master data, manufacturing, reports, and remaining banking styles.
3. Remove route- or component-owned dark palettes after their values move centrally.
4. Confirm no application source retains color literals or independent font stacks.

## Phase 5 — Accessibility and browser behavior

1. Verify Login, Identity, User Management, prototype navigation, forms, dialogs, charts, and document previews in Light and Dark.
2. Verify System follows operating-system changes while explicit modes remain fixed.
3. Resolve contrast failures through semantic tokens rather than component overrides.

## Phase 6 — Final verification

1. Run design-system and chart gates.
2. Run type checking, linting, formatting, and the complete unit suite.
3. Run production and legacy builds.
4. Run the full legacy regression suite.
5. Run focused Playwright theme and WCAG acceptance tests.
6. Review the final diff for unrelated formatting or behavior changes.
