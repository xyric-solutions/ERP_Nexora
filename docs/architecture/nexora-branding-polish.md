# Nexora branding and icon polish — 2026-11-02

- Visible sidebar/mobile/sign-in branding and browser metadata now use the
  shared application name **Nexora**. The sidebar no longer renders the
  prototype/connected-workspace subtitle. Source-state labels inside prototype
  pages remain accurate; no API or data capability changed.
- Added a small folded-N vector mark, shared by the sidebar and sign-in page.
  The favicon uses the same geometry. Its fixed amber is deliberate brand
  artwork; normal UI colours continue to use semantic theme tokens.
- Replaced the separate header expansion control and old header collapse glyph
  with one circular double-chevron toggle at the sidebar's lower edge. It stays
  clear of search, preserves its keyboard focus as it toggles, exposes expanded
  state and controls the named navigation element. Mobile keeps its existing
  menu/close controls. Scroll padding keeps the last navigation entries reachable;
  the floating desktop toggle is excluded from printed output.
- Centralized outline module icons in `app/shell/config/module-icons.tsx`.
  Replaced module letter tiles, header My Work/AI/search/help/notification glyphs,
  appearance icon sizing and both shared/dashboard KPI drill arrows with vectors
  sized to `1em`. Menu icons and labels share a 13px type scale. Routes, action
  callbacks, activity badges and record selection remain unchanged.
- Updated the navigation's accessible brand labels and the existing Banking
  workflow selector to match. No feature stylesheet was added or retired.

Verification: production `build:web`, focused ESLint, 10 theme/shell unit cases,
theme audit write/check and `git diff --check` pass. Browser acceptance passes
eight light/dark scenarios at 1440/820/390/320px, verifying the exact title/name,
absent sidebar subtitle, logo presence, icon-to-font dimensions, footer toggle,
module filtering, flyouts, search focus/restoration, graphs and no document
overflow. Evidence/screenshots: `tmp/brand-navigation-evidence/results.json`.

The changes are presentation and application copy only. Existing APIs,
authorization, business records, saved preferences and posting guards remain.
