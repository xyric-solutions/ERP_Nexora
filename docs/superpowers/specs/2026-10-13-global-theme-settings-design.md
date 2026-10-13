# Global Theme Settings

- Status: approved design pending written-spec review
- Date: 2026-10-13
- Scope: all production web routes and the shared Nexora prototype shell

## Outcome

Add a global System, Light, and Dark appearance setting with System as the
first-visit default. The selected preference applies consistently to the main
prototype, login, Identity & Access, User Management, loading, error, and
not-found surfaces. Theme work must not alter authentication, authorization,
navigation, forms, API calls, or other in-progress functionality.

## Architecture

A shared client-side `ThemeProvider` owns the appearance preference and resolved
theme. It exposes:

- `preference`: `system`, `light`, or `dark`;
- `resolvedTheme`: `light` or `dark`;
- `setPreference`: the only application API for changing the setting.

The provider is mounted once in the shared root layout. Interactive shells use a
reusable `ThemeSelector`; individual features do not read or write storage and do
not implement independent theme state.

The existing prototype-specific light/dark state is removed in favor of this
provider. Other prototype preferences such as density, role, company mode, and
sidebar state remain unchanged.

## Preference and Rendering Flow

The storage key contains only the enum value `system`, `light`, or `dark`.
Invalid, missing, or inaccessible storage falls back to `system`.

A small static initialization script in the root layout resolves the saved
preference before visible application content renders. It applies the actual
theme to the document element and sets the browser `color-scheme`. This prevents
a saved dark preference from flashing a light surface during hydration.

When the preference is `system`, the provider listens to
`prefers-color-scheme: dark` and updates immediately if the operating-system
setting changes. Explicit Light or Dark preferences ignore later system changes.
If media-query support is unavailable, System resolves to Light.

The document exposes both the chosen preference and resolved theme as data
attributes. CSS consumes only the resolved theme; controls display the chosen
preference.

## Theme Controls

The reusable selector presents three explicit options: System, Light, and Dark.
It appears in:

- the main prototype top bar;
- the Identity & Access header;
- the login surface.

Loading, error, and not-found pages inherit the current theme and do not need a
separate control. The selector uses a visible label or accessible name, keyboard-
operable native controls, clear focus treatment, and a selected value that does
not rely on color alone. Responsive headers must keep the selector reachable
without obscuring existing actions.

## Centralized Styling Boundaries

Styling responsibilities are separated so future changes have one obvious home:

- `theme-colors.css` defines semantic color tokens for Light and Dark, including
  canvas, surfaces, text, borders, brand, focus, state, navigation, overlays, and
  chart/role accents where theme-specific values are required.
- `typography.css` defines font families, type sizes, weights, tracking, and line
  heights. Theme switching never changes fonts.
- `tokens.css` retains non-color design tokens such as spacing, dimensions,
  radii, elevation geometry, density, and motion.
- Component styles consume semantic variables and do not define independent
  theme palettes.

Hard-coded production colors in login, Identity & Access, and User Management
styles are replaced with semantic tokens. Existing visual hierarchy and layouts
are preserved. Any literal colors that remain must be documented non-theme
assets or values that cannot vary by appearance.

## Compatibility

The shared provider replaces the prototype's binary theme toggle. Existing saved
prototype `light` or `dark` values are migrated once when no new global preference
exists. The new preference then becomes authoritative for every route.

No server session, database record, cookie, API contract, or authorization rule
changes. The preference is device/browser-local and contains no sensitive data.

## Failure Handling

- Storage read/write failures do not block rendering or user actions.
- Invalid stored values are ignored and replaced by System behavior.
- Missing `matchMedia` support resolves System to Light.
- A failed theme change never interrupts authentication, form state, navigation,
  or network operations.
- Event listeners are removed when the provider unmounts or the preference stops
  following the system.

## Accessibility and Visual Requirements

- Light and Dark variants meet WCAG AA contrast for normal text and interactive
  controls where applicable.
- Focus indicators remain visible on all surfaces.
- Status and validation meaning is not communicated through color alone.
- Native form controls receive a matching `color-scheme`.
- Reduced-motion behavior remains unchanged; theme changes do not introduce
  animations that can delay or obscure interaction.

## Verification

Automated checks cover:

- first visit defaults to System;
- saved System, Light, and Dark preferences restore correctly;
- System responds to operating-system changes while explicit choices do not;
- invalid or unavailable storage safely falls back;
- the document attributes and `color-scheme` match the resolved theme;
- all three selectors use the shared provider and are keyboard accessible;
- existing login, session, Identity & Access, User Management, and prototype
  behavior remains unchanged;
- production styles use centralized semantic tokens instead of local palettes;
- type checking, linting, formatting, unit/component tests, legacy design-system
  tests, accessibility checks, and production build pass.

Manual acceptance covers first-load flash behavior, all three settings, operating-
system changes, persistence after refresh and navigation, responsive headers,
login and authenticated routes, loading/error/not-found states, and representative
forms, tables, dialogs, and status indicators in both Light and Dark.

## Acceptance Criteria

- System, Light, and Dark are available everywhere a theme control is required,
  with System as the first-visit default.
- One saved preference controls every web route and the shared prototype shell.
- Theme colors and typography are centralized in separate files with clear
  ownership; component styles consume semantic tokens.
- Saved themes render without a visible opposite-theme flash.
- Theme switching does not reset forms, trigger API calls, change permissions, or
  affect any existing business behavior.
- Relevant automated and manual checks complete without an unresolved contrast,
  accessibility, hydration, or functional regression.
