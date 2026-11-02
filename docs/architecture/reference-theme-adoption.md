# Reference theme adoption — 2026-11-02

The reference is the user-selected, read-only project at
`D:\Xyric Work\Nexora_ERP\design-templates\dashboard-v1`, particularly
`DESIGN.md` and its final CFO/Food styles. No source, helpers or evidence were
written into that project. Nexora keeps its own navigation, branding, APIs and
feature boundaries.

## Shared appearance

| Role | Light | Dark |
| --- | --- | --- |
| Workspace | `#f7f7f3` | `#151714` |
| Cards | `#ffffff` | `#20231e` |
| Sidebar | `#20211f` | `#181b15` |
| Primary action | `#ffb31a` | `#ffb31a` |
| Main text | `#252721` | `#eceee5` |
| Muted text | `#65695c` | `#b6bcae` |
| Accent text | `#8a5a00` | `#ffce67` |

Amber fills use dark ink; accent text uses a darker amber in light mode to
remain readable. Core text/action contrast calculations range from 5.63:1 to
15.10:1, including hover and featured-metric text. These calculations describe
the listed semantic pairs, not an exhaustive accessibility certification.

`theme-colors.css` owns both palettes and semantic statuses. Old role-level
navy overrides were removed, so role selection cannot replace the palette.
`typography.css` uses the reference's system Segoe UI/Inter fallback stack;
`app/layout.tsx` retains Geist Mono loading for identifiers. Geometry tokens now
provide softer card/control corners and 40px standard controls, retaining the
existing compact density. The shell uses a charcoal navigation frame and a pale,
rounded workspace. The shared first-metric treatment uses a dark olive/amber
gradient while retaining values, trend data and performance signs.

## Controls and filters

Buttons, inputs, selects, textareas, sheets and alert-dialog overlays use semantic
surfaces and state colours. `FilterBar` centralizes wrapping, search sizing and
bottom-aligned filter controls across generic, module, Banking and commercial
lists. `ListFilterSelect` exposes persistent labels; advanced dates have explicit
accessible names. Search, status, custom dates, saved views, sorting, selection,
clearing and callbacks remain owned by their original screens.

Commercial list/form grids now have bounded tracks. Table scrollers establish
positioning containment so off-screen screen-reader labels cannot expand the
document. AI answer content can shrink while its detailed table scrolls locally.
These changes preserve narrow-screen access without hiding overflowing records.

All 12 remaining feature views with fixed palette utilities were migrated to
semantic roles, including Banking payment/receipt heroes, status panels,
revaluation controls and remaining HR/Finance/master-data messages. Existing
categorical chart identities, ordinal ramps, deliberate chart artwork and
monochrome document/print output were retained. No feature stylesheet was deleted.

## Verification and limits

- Final settled-route browser sweep passed 160 checks across representative
  routes from all 35 modules plus HR/Identity details in light/dark at 1440/390px.
  It verified actual root palette values, accent-text colour and font stack,
  populated page content, no page errors and no horizontal document overflow.
  Evidence and screenshots: `tmp/reference-theme-evidence/results.json`.
- Production `build:web`, full workspace typecheck and `git diff --check` pass.
- 34 focused unit/component tests pass for theme preference persistence,
  Banking details/navigation/grant retries, Identity decisions and policy inputs.
- Functional browser filters pass 12 contexts: generic and commercial lists in
  light/dark at 1440/820/320px, exercising search, custom date ranges and clearing
  with no document overflow. Evidence: `tmp/reference-filter-evidence/`.
- Central controls, layout, new shared components and the audit generator pass
  focused ESLint. An expanded check reports 25 existing label/effect-state
  findings in older feature renderers; those unrelated hooks and form structures
  were preserved. A repository-wide clean lint run is not claimed.
- Theme audit write/check reports zero font or colour exceptions in the 110
  feature view source files. The standalone payslip HTML retains a deliberate
  monochrome colour exception; the standalone learning certificate retains its
  print font. This is source coverage, not verification of every menu route.

No API contract, authorization, posting, database or business-record mutation
was introduced by the theme work. Resume any remaining route/state acceptance
from the browser evidence, keeping custom chart and document semantics intact.
