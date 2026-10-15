# Remaining UI migration checklist

## Goal

Complete the gradual migration from feature-scoped `nx-*` CSS to Tailwind utilities and shared shadcn/ui primitives, without changing routes, data, permissions, mock workflows, or user-visible business behaviour.

The current target is now a full Tailwind presentation migration. Feature CSS remains temporarily only while its corresponding markup is being converted and visually verified; a stylesheet is removed only when no active selector depends on it.

The codebase is already organised for this work:

- `app/shared` owns cross-feature tokens, reusable UI and types.
- `app/shell` owns the ERP navigation shell and workspace composition.
- `app/features/<feature>` owns its models, views, components and feature styles.
- `apps/web/src/components/ui` owns the shared shadcn/ui primitives.

## Non-negotiable rules

1. Work one feature at a time. Do not mix unrelated feature changes in one batch.
2. Preserve all existing action handlers, links, navigation targets, keyboard interactions, access checks and mock-data behaviour.
3. Prefer an existing component from `apps/web/src/components/ui` before introducing a new one.
4. Put a component in `app/shared/ui` only when it is genuinely reused across independent features. Otherwise keep it inside its feature.
5. Do not duplicate business fixtures, calculations or TypeScript types while changing visual code.
6. Keep CSS import order centralised in `app/layout.tsx` until a feature stylesheet has been completely removed.
7. Remove a CSS rule or stylesheet only after all of its selectors are no longer used. Never delete a stylesheet merely because some controls were converted.
8. After every completed feature batch, run:

   ```powershell
   npm.cmd --prefix apps\web run build
   ```

9. Before declaring a feature complete, check both the source and styles for the old selectors:

   ```powershell
   rg -n 'nx-' app\features\<feature>
   ```

10. Rebuild Docker only after a meaningful batch is verified:

   ```powershell
   docker compose build web
   docker compose up -d --force-recreate --no-deps web
   ```

## Completed work

- Feature-first source structure and ownership boundaries.
- Shared shadcn/ui foundation, Tailwind setup, global token bridge and shared primary action controls.
- Login and Identity & Access UI action controls.
- Shared reporting controls and dashboard primary actions.
- Shared reporting-period balance-forward control now uses the common shadcn checkbox primitive.
- Banking, HR, reports, master-data, manufacturing and commerce workflow action controls.
- Shell search, confirmation, notifications, help dialogs and shared form footer actions.
- Generic prototype list search and row-selection controls now use the shared shadcn input and checkbox primitives.
- Generic prototype form blueprints, editable line entries and supporting-evidence fields now use shared shadcn input and textarea primitives.
- Generic and profile-based report date filters and profile form fields now use shared shadcn inputs and textareas.
- Generic shell settings now use shared shadcn inputs, textarea and checkboxes; shell and shared TSX files no longer contain native input or textarea controls.
- Central CSS registration through `app/layout.tsx`.
- Shared module data-table row selection and status presentation now use the common shadcn checkbox and badge primitives.
- Shared module filter-bar search, action, icon and pagination controls now use common shadcn input and button primitives while retaining responsive shell layout classes.
- Dashboard chart-header drill-down actions now use the shared shadcn button primitive; KPI, alert and shortcut controls remain specialized interactive cards and rows.
- Dashboard role hero layout, role-context panel and dashboard-context badges now use Tailwind utilities with responsive behavior retained.
- Dashboard KPI grid and card presentation now use Tailwind utilities, while retaining the existing Sparkline and drill-down behavior.
- Dashboard comparison is already on shared Tailwind table primitives; dashboard visual headers now use the shared badge primitive.
- Dashboard role deep-dive metric and signal grids now use Tailwind utilities; `role-deep-dive-intelligence.css` has been retired after confirming no remaining selector usage.
- Dashboard executive headline, ranking and operations grids now use Tailwind utilities; `executive-dashboard-intelligence.css` has also been retired with dashboard charts and drill-down actions preserved.
- Banking account-list filters, statement reconciliation toggle and reusable nominal-account selector now use shared shadcn primitives.
- Banking transaction form text, date, amount, attachment and notes fields now use shared shadcn input and textarea primitives.
- Banking reconciliation worksheet statement fields, adjustment inputs, search and movement-selection controls now use shared shadcn input and checkbox primitives.
- Banking transaction direction choices, reconciliation tabs and transaction-detail tabs now use shared shadcn button primitives while retaining their current selected-state styling.
- Banking statement date, query and amount filters now use shared shadcn inputs; reconciliation candidate selection now uses the shared Base UI-backed radio-group primitive.
- Banking batch-entry metadata and editable transaction-line text, date and amount fields now use shared shadcn inputs; batch validation and live journal calculations remain unchanged.
- The reusable searchable Chart of Accounts selector is now Tailwind/shadcn-based, including selected-account presentation, debit/credit markers, search panel, empty state and validation messaging.
- Banking transaction form sections, responsive field grid, required/error/help states and wide field groups now use Tailwind utilities while retaining the same validation and journal-preview behavior.
- Banking statement filters, period presets and unreconciled toggle are now Tailwind-based while retaining the same account, date, query, type, nominal and amount filter state.
- Banking transaction/account detail headers, action groups, status badges and summary cards, plus statement totals and table states, are now Tailwind-based with drill actions and journal calculations unchanged.
- Banking batch-entry header, metadata, funding-account and line-heading panels, plus the reconciliation workspace shell, headline, controls, summary and responsive split layout, are now Tailwind-based. Entry, matching, balance and approval state logic remains unchanged.
- The banking batch line-entry table, validation/action/effect panels, reconciliation statement and match panels, and manual worksheet headline, method selector, controls and balance equation are now Tailwind-based. Editable rows, radio match selection and reconciliation arithmetic remain unchanged.
- HR master record tabs and HR reporting date/search fields now use shared shadcn primitives while existing role-aware reporting filters remain unchanged.
- HR attendance date/display fields, lifecycle search/filter actions and payroll read-only period display now use shared shadcn controls.
- HR reporting domain filters, report-back navigation and permission-aware export controls now use shared shadcn buttons.
- HR reporting chart-header action and report-table pagination now use shared shadcn buttons; report dashboards, analytics, catalogue, detail, audit and compliance layouts now use Tailwind utilities, and `hr-reporting.css` has been retired after selector verification.
- HR lifecycle hero actions, family navigation and detail-panel actions now use shared shadcn buttons; the complete lifecycle workspace, register, workflow indicators and detail panel now use Tailwind utilities, and `hr-lifecycle.css` has been retired after selector verification.
- HR attendance grids, notices, salary and loan panels, payroll workflow tracks, lifecycle and reporting pages are now Tailwind-based. All three HR feature stylesheets (`hr.css`, `hr-lifecycle.css`, `hr-reporting.css`) have been retired after cross-project selector verification.
- Commerce list workspaces now use shared input, checkbox and button primitives for search, filtering, saved views, bulk actions and pagination; document links and row menus retain their specialized layouts.
- Commerce transaction controls, document toolbars, record-preview tabs and footer actions now use shared shadcn buttons and textarea controls; workflow diagrams, record cards and related-document links remain specialized.
- Commerce document-entry commands and tabs, header dates/references, party lookup, supporting-information fields and memo textareas now use shared shadcn controls; editable line grids remain specialized for dense transaction entry.
- Commerce product/service and expense allocation line grids now use shared shadcn inputs and buttons while preserving their dense table geometry, totals and calculation state.
- Commerce document attachments, summary adjustments, reviewer notes, decision comments and notification choice now use shared shadcn input, textarea, checkbox and button primitives; retained legacy entry markup is not mounted by the workspace router.
- Commerce shared page headers, workflow stages, page shells, KPI cards and complete list-screen chrome (filters, saved views, bulk actions, empty state and pagination) now use Tailwind utilities. The document-entry action bar, lifecycle strip, record summary and document-detail tabs are also Tailwind-based; the remaining document grids and specialized workspace panels retain their feature CSS until their layouts are migrated.
- Commerce printable document templates now use Tailwind utilities, with print-only hooks retained through data attributes in the shared print stylesheet. `document-template.css` has been retired after selector verification.
- Commerce enterprise transaction controls now use Tailwind utilities for their lifecycle, command bar, tabs, readiness, approval, accounting and audit surfaces. `enterprise-transaction-control.css` has been retired after cross-project selector verification.
- Commerce document workbench grids, accounting preview, supporting-information panel and collaboration rail now use Tailwind utilities while retaining the shared dense entry-table primitives. `document-workbench.css` has been retired after cross-project selector verification.
- The shared form-legibility contract has moved from the commerce tree into the permitted Tailwind global entry, preserving native-control, primary-action and error states. `form-contrast.css` has been retired after selector verification.
- Shared full-screen form context, responsive field grids, dense transaction entry, review rails and sticky action docks are now Tailwind-based. The remaining banking, batch-entry, commerce and master-data wrappers were detached after their own layout styles were confirmed, and `form-workspace.css` has been retired after cross-project selector verification.
- Master-data setup navigation, validation action, form-error dismissal and boolean toggles now use shared shadcn buttons and checkboxes; detailed field layouts remain feature-specific pending visual regression.
- Master-data identity, contact, address, tax-registration and bank-detail text fields now use shared shadcn inputs; fixed-option selects remain native to preserve established entry workflows.
- Master-data field rendering now recursively normalizes nested native inputs and textareas to shared primitives; contacts and attachments also use shared input, checkbox and button controls.
- Master-data page header, completion state, error state, reusable fields, toggle cards, section headers, responsive grid, review-rail placement, navigation and sticky action dock now use Tailwind utilities; its legacy stylesheet is retained for the remaining review cards and dense data-entry structures.
- Manufacturing BOM and order catalogue search/export controls plus activity-rail actions now use shared shadcn primitives; BOM/MO process tables and lifecycle controls remain intentionally specialized.
- Manufacturing BOM and production-order tab navigation, variance actions and corrective-action textarea now use shared shadcn controls; the production tables, lifecycle indicators and process cards remain specialized.
- Manufacturing BOM headers, revision/product metadata, planning details and production-order schedule fields now use shared shadcn inputs and textareas; dense component and variance cells remain specialized for table-entry geometry.
- Reports catalogue search and common report-workspace actions, table search and pagination now use shared shadcn controls; report-browser navigation and insight cards retain their purpose-built interactive layouts.
- AI command, policy, source-confidence, evaluation, audit, My Work, assistant and explain-number panels now use shared shadcn controls for standard actions and inputs.

## Remaining work, in execution order

### Phase 1 - shared foundations

Target files:

- `app/shared/ui/module-views.tsx`
- `app/shared/ui/analytics-charts.tsx`
- `app/shared/ui/reporting-period-controls.tsx`
- `app/shared/styles/*.css`
- `app/shell/prototype-content.tsx`
- `app/shell/prototype-shell.tsx`
- `app/shell/styles/prototype-extra.css`

Tasks:

- Replace remaining repeated inputs, selects, checkboxes, tabs, tables, badges, alerts and empty states with shared shadcn/ui components or small shared wrappers.
- Convert shell layout, modal, toast, command-palette and navigation styling to Tailwind classes in small visual sections.
- Retain stable CSS variables in the global token files until each consuming feature has been migrated.
- Do not migrate chart geometry or print styling in this phase.

Completion criteria:

- Shared controls have one reusable implementation.
- Shell interactions behave the same at desktop and narrow widths.
- No duplicate common control implementation is introduced.

Current safe resume point:

- `app/shared/ui/module-views.tsx` has completed its table checkbox and status-badge conversion.
- `app/shared/ui/module-views.tsx` has completed its filter-bar search, actions, icon controls and pagination conversion.
- Dashboard interactive controls have been reviewed: generic actions use shared primitives, while specialized card and row controls retain their semantic layouts.
- Dashboard role hero, context panel and badges have been migrated to Tailwind.
- Dashboard role KPI presentation has been migrated to Tailwind with existing data and interactions retained.
- Dashboard shared controls, hero, KPI grid, comparison, chart-header action and visual-header badges are complete.
- Drill-through breadcrumbs, back navigation, print/return controls and pagination now use shared shadcn buttons; chart segments and transaction links remain specialized drill targets.
- The remaining dashboard visual surface consists of 96 feature-specific chart/card selectors. These are intentionally retained for chart geometry, data bar widths and keyboard-accessible card layouts; they should be migrated in the final CSS-removal phase only with visual regression testing.
- Generic shell, shared, list, report, form and settings text-entry controls are migrated to shared shadcn inputs, textareas and checkboxes.
- Next, audit the remaining native banking-statement and reconciliation controls, then continue with the dense feature-grid controls that cannot safely be changed by bulk replacement.

### Phase 2 - dashboard and drill-down

Target directories:

- `app/features/dashboard`
- `app/features/drill`

Tasks:

- Convert dashboard cards, filters, scorecards, tables and chart wrappers to Tailwind utilities.
- Keep chart data, SVG geometry, drill URLs and analytics calculations unchanged.
- Convert dashboard-only stylesheet rules only after their view selectors have been removed.
- Preserve report-period selection, role context and drill-through actions.

Completion criteria:

- Dashboard view styles no longer depend on feature `nx-*` selectors.
- Drill-down routes and record context are unchanged.

### Phase 3 - banking

Target directory:

- `app/features/banking`

Tasks:

- Convert statement grids, reconciliation workspaces, batch-entry rows, transaction details and forms.
- Use shared `Table`, `Input`, `Select`, `Checkbox`, `Dialog`, `Badge`, `Card` and `Button` primitives where applicable.
- Preserve reconciliation matching, date filters, validation messages and mock transaction state.
- Remove `banking.css`, `banking-grid.css` and `banking-reconciliation.css` only after all selectors are unused.

Completion criteria:

- Banking workflows remain functionally identical.
- No banking-specific legacy style selectors remain in TSX.

Current safe resume point:

- Bank account-list filters, statement actions and the reusable account selector are migrated to shared controls.
- Banking transaction form text, date, amount and notes fields are migrated with their existing validation and state updates retained.
- Reconciliation worksheet selection and adjustment controls are migrated with all matching and reconciliation calculations retained.
- Banking shared controls are complete for this phase. Native selects and radio choices remain intentionally because their workflow-specific option/routing behavior is already accessible and stable.
- Banking statement filters and reconciliation candidate selection are now also shared primitives; banking TSX contains no native input, textarea, checkbox or radio JSX.
- Next, audit the remaining dense master-data, commerce and manufacturing field grids; preserve selectors that encode table geometry or workflow state.

### Phase 4 - HR

Target directory:

- `app/features/hr`

Tasks:

- Convert master, attendance, lifecycle, payroll and reporting layouts in that order.
- Preserve approval, leave, attendance lock, payroll approval and export restrictions.
- Keep the existing role and authorization handling intact.
- Retire the three HR feature stylesheets only after their selectors have been fully replaced. **Completed:** all three were removed after cross-project selector verification.

Completion criteria:

- All HR workflows retain current validation and disabled states.
- No HR visual change bypasses current permission logic.

Current safe resume point:

- HR master record tabs and HR reporting date/search controls are migrated to shared primitives.
- HR attendance, lifecycle and payroll common input/control migrations are complete with their existing workflows retained.
- HR reporting is fully Tailwind-based; exports and reporting permissions remain governed by the same checks.
- HR lifecycle has been fully migrated to Tailwind and its stylesheet retired without changing lifecycle transitions, record selection or action rules.
- Next, migrate the remaining HR attendance, payroll and reporting presentation layouts, preserving controls whose layout communicates workflow state.

### Phase 5 - commerce, master data and manufacturing

Target directories:

- `app/features/commerce`
- `app/features/master-data`
- `app/features/manufacturing`

Tasks:

- Convert document forms, record preview panels, approval screens and transaction controls.
- Convert master-data forms and their sticky action regions.
- Convert BOM, manufacturing-order and variance layouts.
- Keep lifecycle transitions and decision actions unchanged.

Completion criteria:

- Forms retain labels, validation hints, keyboard focus and submission behaviour.
- All destructive/rejection actions remain visually distinct and require the existing confirmation path.

Current safe resume point:

- The common-control pass is complete for commerce list screens, master-data setup navigation and manufacturing catalogues.
- Next, review commerce document forms and transaction controls, then master-data detailed field groups and manufacturing BOM/MO tabs with visual regression testing.

### Phase 6 - AI, reports, finance and fleet surfaces

Target directories:

- `app/features/ai`
- `app/features/reports`
- `app/features/finance`
- `app/features/fleet`

Tasks:

- Convert the remaining workspace panels and report layouts.
- Keep information hierarchy, read-only mock-data notices and no-posting safeguards visible.
- Where a feature has only a model today, leave it unchanged; do not manufacture an unnecessary visual layer.

Completion criteria:

- All current views use Tailwind/shadcn for their UI layer where suitable.
- No feature is given a new dependency solely for styling.

Current safe resume point:

- Reports and AI standard controls are migrated, including embedded intelligence surfaces.
- Finance and fleet currently expose models only, so no UI was created for them.
- Next, review remaining specialized report, AI, commerce, HR and manufacturing layouts before starting Phase 7 stylesheet removal.

### Phase 7 - CSS removal and visual regression pass

Tasks:

- Remove only fully obsolete feature CSS files and their matching imports from `app/layout.tsx`.
- Keep global design tokens, print styles and any intentional CSS required for complex charts until an equivalent exists.
- Check login, dashboard, Identity & Access, banking, HR, commerce, reports, manufacturing and mobile navigation in both light and dark mode.
- Verify focus states, disabled states, alerts, tables, dialogs, forms and narrow-screen overflow.
- Run the production build and rebuild the web container.

Completion criteria:

- No obsolete stylesheets remain imported.
- The build passes.
- Navigation, authentication, Identity & Access, and all mock workflow interactions still work.

## Definition of done

The HR Employee Approvals workspace was added with Tailwind and shared UI
primitives; it introduces no feature CSS. Its API-backed queue, detail and
decision flow passed targeted HR tests and the web production build. Live
browser verification remains part of the HR delivery plan.

The HR Employee Contacts workspace also uses Tailwind and shared UI primitives
without adding feature CSS. It presents only API-authorized email/phone contact
records and does not fall back to mock sensitive data.

The adjacent HR Emergency Contacts workspace follows the same Tailwind/shared
primitive approach, with a separate permission boundary and no feature CSS.

The HR Employee Documents workspace also uses Tailwind/shared primitives with
an API-backed, permission-scoped metadata register. It intentionally exposes no
file path, object-storage key, upload action or download action until the secure
storage workflow is implemented.

The HR Employment Assignments workspace is a Tailwind/shared-primitive,
API-backed, read-only effective-dated timeline. It introduces no feature CSS
and deliberately leaves activation and employee movement mutations unavailable
until their governed approval workflows are built.

The HR Employee Status History workspace is also Tailwind/shared-primitive and
API-backed. It presents only scoped immutable status evidence; it has no mock
fallback, actor identifiers, or state-changing control.

The HR Lifecycle Policies workspace is Tailwind/shared-primitive and API-backed
with company scope and bounded policy projections. Authorized policy managers
can create an idempotent, auditable **draft** using the fixed initial
pre-employment/employed definition and approval-required Hire transition.
Authorized managers can also submit a draft with a required reason. An
independent approver can approve a pending policy with maker/checker separation;
approval intentionally does not activate the policy. Activation remains
unavailable until its governed workflow is implemented.

The migration is complete only when every active screen has been reviewed, common controls are shared, feature boundaries remain intact, obsolete feature CSS has been removed deliberately, and `npm.cmd --prefix apps\\web run build` passes after the final change.
