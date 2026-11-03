# Bank and HR density and alignment design

## Objective

Improve the active Bank and HR workspaces without changing business behavior. Remove avoidable whitespace, align labels and controls to a consistent visual level, make tables and panels easier to scan, and distinguish bank-account identifiers with a restrained amber capsule that remains legible in light and dark themes.

## Scope

- Bank and HR feature views and their feature-owned shared components.
- Repeated workspace patterns: page sections, scope/filter toolbars, field labels, controls, metric cards, tables, drawers, and empty/error states.
- The Bank Account Balances table, including the visible bank/account identifier capsules from the approved screenshot.
- Existing semantic theme tokens and Tailwind utilities. No new feature stylesheet or dependency.

Out of scope:

- API contracts, financial or HR workflows, permissions, state transitions, persistence, routing, or navigation behavior.
- A global density change outside Bank and HR.
- Replacing deliberate document, chart, print, or brand styling.

## Chosen approach

Use a scoped consistency pass instead of a page-only patch or a global restyle.

1. Normalize the feature-owned reusable Bank and HR layout helpers first so screens sharing them receive the same spacing, label, and control treatment.
2. Update active high-traffic views that implement those patterns locally, beginning with Bank Account Balances and the HR dashboard/directory surfaces.
3. Apply focused mechanical corrections to repeated Bank/HR Tailwind patterns where the same alignment problem is present, while leaving specialized workflows unchanged.
4. Reuse the existing warning semantic roles for the bank-account capsule: `--nx-warning-soft`, `--nx-warning-border`, and `--nx-warning`. This gives a pale amber surface in light mode and a muted gold-on-charcoal treatment in dark mode without introducing literal page colours.

## Visual rules

### Density and rhythm

- Workspace sections use a consistent compact vertical rhythm, normally `gap-4` / `space-y-4` rather than larger spacing where no hierarchy requires it.
- Standard panels use `p-4`, with `sm:p-5` reserved for primary or information-dense panels.
- Form rows use an 8px field gap and a 6px label-to-control gap.
- Standard controls align to a 36px or 40px height according to the existing shared primitive; mixed heights within one toolbar are removed.
- Tables use compact but accessible rows, normally 12px vertical cell padding, with primary and secondary text kept on a predictable two-line baseline.

### Labels and controls

- Visible labels sit above controls and use the same small, medium-weight text treatment.
- Controls in the same row align at their lower edge on desktop and stack at full width on narrow screens.
- Icon-only controls retain accessible names and visible focus rings.
- Helper copy remains visually subordinate and does not force unrelated controls out of alignment.

### Bank-account capsule

- Bank-account identity values use a compact rounded capsule with semantic warning background, border, and text.
- The capsule is reserved for clickable or identifying bank-account values, not ordinary table text or statuses.
- It keeps a visible hover/focus affordance when interactive and does not rely on colour alone to communicate an action.

## Responsive and accessibility behavior

- Toolbars wrap into full-width labelled fields before controls become cramped.
- Wide ERP tables retain horizontal scrolling and their existing minimum widths.
- Labels remain programmatically associated with controls.
- Table semantics, keyboard actions, focus visibility, disabled states, loading states, error states, and empty states are preserved.
- Colour contrast is derived from the central semantic light/dark tokens and verified in both themes.

## Behavior preservation

This is a presentation-only batch. Existing component props, request parameters, mutation callbacks, authorization checks, business calculations, routes, drawer behavior, sorting, filtering, pagination, and no-posting safeguards remain unchanged.

## Verification

- Review the diff for Bank/HR-only presentation changes and unrelated churn.
- Run focused tests for any component whose rendered structure changes.
- Run `node scripts/audit-ui-theme.mjs --write`, review the report, then run `node scripts/audit-ui-theme.mjs --check`.
- Run the repository lint/type checks applicable to changed files.
- Run `git diff --check` and `npm.cmd run build:web`.
- Perform authenticated browser checks on desktop and narrow widths for Bank Account Balances and representative HR dashboard/directory/form surfaces, in light and dark themes when the local runtime permits.
- Record the completed batch and any remaining exceptions in `docs/architecture/remaining-ui-migration.md`.

## Risks and controls

- **Over-broad descendant styling:** avoid global or shell-level selectors; change feature-owned helpers and explicit Tailwind classes.
- **Dense controls becoming hard to use:** retain existing shared control heights and minimum touch targets; reduce empty space around controls, not the controls themselves.
- **Semantic amber confused with warning status:** reserve the capsule for bank-account identity and keep status badges unchanged.
- **Large HR surface area:** centralize only repeated layout behavior, then verify representative consumers and avoid speculative rewrites of specialized workflows.
