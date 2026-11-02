# Navigation, search and graph reference polish — 2026-11-02

## Completed

- Removed the fixed sidebar-reopen tab and its verified-unused CSS. A normal
  header button expands a collapsed rail without overlapping global search.
- Collapsed module search is an explicit button that expands the menu and
  focuses its filter. Navigation inputs disable browser autocomplete, use
  sidebar foreground tokens and retain a single visible focus treatment.
- Removed CSS-only tablet collapse overrides. The React sidebar state now
  owns both rendering and behavior at tablet widths, honoring saved choices;
  new tablet sessions still default to a compact rail. Narrow header actions
  reduce to icons, keeping expanded tablet navigation within the viewport.
- Matched the module flyout to the charcoal menu, with full-width transparent
  links, visible hover/focus/current states and retained HR workspace grouping.
- Moved global search onto the shared Dialog primitive for modal focus and
  keyboard behavior. Kept search indexing, filters, exact-record navigation,
  Ctrl/Cmd+K, Escape and unsaved-entry guards.
- Removed the mock-only review toolbar and navigation page-count badges, plus
  the numeric module-search placeholder. Existing live master-data controls,
  source/prototype labels, role defaults and business safeguards remain.

## Graph appearance

The shared graph palette now follows the user's reference: amber, olive, orange,
gold and supporting earth tones, with brighter counterparts for charcoal mode.
Compatibility tone identifiers and category order are stable. Status roles and
neutral overflow remain separate; ordinal stages retain an ordered amber ramp.
Every categorical mark clears 3:1 against its normal card surface (light minimum
3.64:1, dark minimum 6.00:1). Legends, direct labels and screen-reader tables remain.

`chart-geometry.ts` provides monotone cubic joins through the original points.
Shared sparklines and combination charts use those curves without area washes,
and donut rings are slimmer with rounded ends. No observation, label, total,
comparison basis, chart type or financial action is replaced with reference
fixtures. Featured-card status text uses lighter semantic colours for contrast.

## Verification

- Browser acceptance: eight scenarios in light/dark at 1440/820/390/320px verify
  expand/search separation, collapsed module search and filtering, readable
  flyouts, global-search focus/results/Escape, removed review row/count badges,
  reference curves and absence of document overflow. Evidence and screenshots:
  `tmp/shell-reference-evidence/results.json`.
- Six chart-palette gates pass, including contrast, stable category slots,
  semantic status separation, ordinal mapping and shared drill colours.
- Twelve focused unit/component tests pass for curve endpoints/no overshoot,
  shell navigation and theme settings. Palette tests now read the real current
  feature paths instead of the obsolete pre-migration root paths.
- Production `build:web`, focused ESLint, theme audit write/check and
  `git diff --check` pass. The theme audit retains zero feature-view font/colour
  exceptions; standalone print exceptions remain deliberate.

No stylesheet was retired entirely. No API, migration or stored business record
changed. This batch supersedes the earlier choice to retain cool chart colours
in `reference-theme-adoption.md`; series identity and numeric meaning remain.
