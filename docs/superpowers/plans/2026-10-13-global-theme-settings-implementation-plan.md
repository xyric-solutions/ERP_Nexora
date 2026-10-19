# Global Theme Settings Implementation Plan

- Status: implementation approved
- Date: 2026-10-13
- Approved design: `../specs/2026-10-13-global-theme-settings-design.md`
- Scope: appearance only; no business, auth, API, or persistence-domain changes

## Delivery Invariants

1. System is the first-visit default; Light and Dark are explicit overrides.
2. One browser-local preference controls every route and the prototype shell.
3. Theme switching never resets component state or triggers application APIs.
4. Existing non-theme prototype preferences remain compatible.
5. No new dependency is introduced.
6. Component styles consume semantic tokens; color palettes and typography have
   separate centralized owners.

## Task 1 - Characterize shared theme behavior

- Add focused unit tests for System/Light/Dark restoration, system media changes,
  invalid/unavailable storage, document attributes, and selector behavior.
- Extend structural/design-system tests to enforce the new token ownership and
  prevent production CSS modules from reintroducing local palettes.

## Task 2 - Build the shared preference service

- Add pure theme configuration and a pre-hydration initialization script.
- Add a root `ThemeProvider`, `useTheme`, and accessible `ThemeSelector`.
- Mount the provider in the shared layout and migrate the legacy preference only
  when no global preference exists.
- Keep storage and media-query failures non-fatal.

## Task 3 - Separate global design tokens

- Add `theme-colors.css` for global Light/Dark semantic colors.
- Add `typography.css` for font and type-scale tokens.
- Keep geometry, density, radius, and motion in `tokens.css`.
- Preserve legacy prototype role/chart colors while making the global semantic
  palette authoritative for shared surfaces.

## Task 4 - Wire controls and migrate production styles

- Replace the prototype binary toggle with the shared three-option selector.
- Add the selector to Identity & Access and login.
- Make global/loading/error/not-found surfaces inherit semantic tokens.
- Replace hard-coded theme colors in login, Identity & Access, and User Management
  CSS with semantic variables without changing layout or component behavior.

## Task 5 - Verify and review

- Run focused unit/component and legacy design-system tests.
- Run formatting checks for changed files, lint, typecheck, and production build.
- Inspect the diff for unrelated changes and residual production color literals.
- Perform browser acceptance for all three preferences, persistence, system
  changes, responsive headers, and representative login/admin/prototype surfaces
  if the browser helper is available.

## Stop Conditions

Stop and report if theme work changes authentication/session calls, permission
decisions, form submissions, navigation state, API payloads, or business data; if
saved preferences cannot be migrated safely; or if contrast/accessibility checks
cannot be satisfied without changing unrelated layouts.
