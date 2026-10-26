# Remaining UI migration checklist

Current checkpoint: Category-scoped employee Payroll jurisdiction overrides and separately reviewed revocations are delivered, including same-country cross-branch resolution, published mid-month allocation, immutable calculation evidence, explicit revoked-state display and stale-submission protection. Whole-account cost-centre journal mappings remain delivered. Normal and isolated schemas are HR130. HR navigation remains 73 Live, 2 Payroll In progress, 1 Payment Batch Read-only, 0 prototype screens. Employee-level/proportional or other required dimension allocations, non-parity loan carrying-value/FX allocation and general posted-Payroll corrections remain. Cross-country execution and additional legal allocation bases need their own reviewed contracts. Banking integration is separately owned. These are menu statuses, not a completion percentage.
## 2026-10-22 — Bank Transfer approval-flow parity

- Transfer Submit for Approval now persists and opens the authoritative detail
  screen. Eligible same-user governed Super Admin/delegated approval remains a
  separate explicit Approve & Close action and revalidates server state before
  deciding; approval still does not post the Transfer.
- Transfer entry/detail/list/filter now present `submitted` as `Waiting for
approval` and `draft` as `Draft`. Existing API permissions, company scope,
  maker-checker override evidence, idempotency and audit controls are preserved.
- No feature CSS or dependency changed. Focused 18 unit tests, full typecheck,
  scoped lint, diff check and production web build passed. No live Transfer was
  created for verification; continue localhost UAT through the normal form.

## 2026-10-22 — live Finance fiscal calendars / period close

- Added `app/features/finance/views/finance-fiscal-periods.tsx`; existing Fiscal
  Periods and Period Close routes share this real API-backed workspace. ERP shell
  marks it live Finance, retains company context, not companyless master data.
- Existing shared primitives/Tailwind only; no dependency or stylesheet retired.
  Preview, status/version table, batch confirmation/reasons, loading/error/denied
  states, success feedback and immutable history included. URL company/year context
  survives refresh but is never authority. Financial submission/posting guards and
  existing Bank/HR behavior preserved. History latest100; older records retained.
- Verified unit458, contracts12, targeted PostgreSQL integration47/security16,
  calendar browser3 and existing Bank context browser6 cases passed; typecheck,
  generated API check, scoped lint and production build passed. See Finance plan
  for initial concurrent-browser failures and final sequential verification.
- R06 UAT existing 2026 calendar now has twelve Open monthly periods through
  authenticated audited setup, no financial-record changes. Earlier zero-period
  notes below are historical. Regular twelve-month years only; no all-date bypass.

## 2026-10-21 — Bank searchable directory popups / Finance period feedback

- Payment/Receipt Nominal selectors and shared Project, Location/City and
  Approver selectors now use `app/shared/ui/searchable-select.tsx` (installed
  Base UI + shared Button/Input). Separate search boxes removed; search and
  directory pagination are inside the popup. Existing company-scoped APIs,
  eligibility checks, retained selections, validation and 40px sizing preserved.
- No CSS retired or new dependency. Immediate loading during nominal debounce
  prevents stale-result selection. Document Reference stays hidden but existing
  stored values remain preserved on edit.
- Closed/missing-period failures now distinguish a successfully saved draft
  from blocked submission/approval. No Finance control was bypassed. Source has
  zero financial periods; October configuration awaits user authorization.
- Verified: 48 focused component tests, 20 PostgreSQL integration tests,
  14 database-security tests, 12 contract tests, 9 real-API browser tests;
  typecheck, scoped lint/format, API generation check and production build passed.
  Full unit suite initially 438/438; final repeat 437/438 due to pre-existing
  intermittent DelegationPanel test (isolated 4/4). See current Bank handoff.
  Full repository lint remains at the inherited 112 errors / 1 warning; scoped
  lint for the changed files is clean. Temporary test APIs stopped; normal
  web 3000 / API 4000 remain healthy.
- Earlier zero-activation notes below are historical: 131 reviewed imported
  ordinary nominals are now active; 96 documented exceptions remain unchanged.

## 2026-10-21 — Bank entry line sizing / Details follow-up

- Payment and Receipt grids no longer show Document Reference. Loaded legacy
  references are preserved when editing; plain-text Details and Receipt payer
  fields remain. Line inputs/selects/Details initially share 40px height, with
  fixed proportional columns and horizontal overflow on narrow screens.
- No shared primitives/CSS retired or changed. Existing validation, company
  isolation, persistence, approval and posting safeguards intentionally unchanged.
- Verification: 36 component tests and 2 isolated real-API browser tests passed;
  browser checks measure equal control heights and verify nominal persistence.
  Source remains 227 inactive/unclassified imports, not a disconnected API.
  Resume per the latest follow-up in the Bank workflow context handoff; do not
  guess classifications to populate the selector.

## 2026-10-21 — Chart of Accounts direct Super Admin master workflow

- Added `app/features/finance/views/finance-hierarchy.tsx` using existing shared
  Card/Alert/Button/Input/Label and Tailwind/native selects. Existing Section
  Management route now owns company Categories/Sections with real API CRUD/status
  operations, read-only ordinary-user state, validation/error/empty/loading/success.
- Updated nominal forms/detail, company adoption permission visibility and shared
  Bank nominal availability guidance for direct Super Admin activation. No feature
  CSS was added/retired. Existing financial entry/posting and central reference
  catalog navigation/identity were preserved.
- Browser verified category create/edit/deactivate/reactivate plus ordinary read
  isolation; separate browser verification covers direct nominal activation and
  Payment/Receipt selection, save and refresh against isolated PostgreSQL.
- Build/typecheck and exact final results/safe resume are in the latest checkpoint
  of `docs/superpowers/plans/2026-10-21-bank-workflow-context-implementation-plan.md`.
  No blanket source classification/activation: all 227 still require ownership
  review; all 102 headers already active. Continue broader CSS migration separately.

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

## Banking production-integration handoff — 2026-10-19

The following approved Banking surfaces are now API-backed and use PostgreSQL
without a prototype-data fallback:

- `/#/banking/account-balances` and `/#/banking/bank-accounts` — company-scoped
  account summaries, posted-ledger balances, bounded server filtering, sorting
  and pagination;
- `/#/banking/add-bank-account` — encrypted Bank Account draft creation and
  optional submission for independent approval;
- `/#/banking/bank-account-approvals` — pending queue, masked review and
  maker/checker decision; and
- the account-detail workspace opened from a live Account Balances row —
  masked persisted detail plus governed deactivate/close controls.

These surfaces retain the approved layout and shared Tailwind/shadcn controls.
They expose loading, empty, error, success and permission states and are marked
**Backend connected** only after the real Chromium maker/checker acceptance
flow passed. Export remains disabled because there is no export API.

Bank Payments is now production-integrated for its list, entry and persisted
detail routes:

- `/#/banking/bank-payments` uses the live company-scoped API directory;
- `/#/banking/add-bank-payment` persists reload-safe multi-line drafts and
  submits them for independent approval; and
- `/#/banking/transaction-detail/{bank-payment-id}` performs governed approval,
  explicit Finance posting and compensating reversal with immutable audit and
  journal links.

Chromium acceptance passed with distinct maker, checker and poster identities,
the governed `shoaib` self-approval override, restricted-session denial and a
390px viewport. The production build also passed. The shared transaction-detail
page intentionally retains its prototype path for legacy transfer, charge,
interest, cheque and deposit references; persisted receipt IDs use the live
receipt detail workspace on that same route family.

Bank Receipts is now production-integrated for its list, entry and persisted
detail routes:

Other Banking pages, including receipts, transfers, statement import,
reconciliation, charges/interest, cheques/deposits and Treasury, remain
explicitly prototype surfaces. The next production Banking slice is Bank
Receipts and must reuse the delivered Finance posting boundary.


### HR Recruitment Pipeline

Recruitment Pipeline now renders an API-backed application board, scoped search
and pagination, candidate/opening application form, governed stage decisions,
and immutable history. It uses Tailwind and shared Button, Badge, Input,
Textarea, Alert and Skeleton primitives with semantic theme colors. No legacy
styles were retired. Existing HR routes and company/permission boundaries are
preserved. Light/dark browser checks passed at 1440px and 390px, including API
loading, form opening and search; no browser errors or page overflow occurred.
Populated workflow behavior is covered by isolated PostgreSQL/API integration
tests. Next safe UI slice: Interviews & Evaluations, preserving the server
selection-evidence gate and shared theme tokens.


### HR Interviews & Evaluations

Delivered the API-backed application selector, interview rounds, scheduling and
rescheduling forms, outcome decisions, signed-in panel scorecards, assessment
decisions, readiness blockers and evidence activity. Shared Tailwind tokens and
shadcn controls support light/dark modes. Existing Pipeline gates now require
real scheduling/completion evidence, and its Evaluation hint points to the
delivered workspace. No legacy CSS was removed.

Populated Chromium acceptance against an isolated PostgreSQL/API stack passed
scheduling, rescheduling, cancellation, evaluation submission, assessment
decision and selection. Light/dark screenshots passed at 1440px and 390px with
no page overflow or browser errors. Fifteen recruitment integration tests cover
HTTP security, company/tenant scope, concurrency, immutable evidence and stage
gates. Next safe UI slice: Offer Management using the selected-application
authority; retain the accepted-offer gate before employee creation.

Interview refresh now preserves in-progress scorecards during other evidence
actions. Populated browser acceptance verifies ratings and typed strengths
survive an assessment decision before the scorecard is submitted. Activity
labels identify the action and recorded actor for review.


### HR Offer Management

Delivered the live offer register, selected-application context, draft editor,
approval actions, compensation-exception acknowledgement, generated-letter
preview/download, delivery/response evidence and immutable activity history.
Shared Tailwind tokens and shadcn controls support both themes. The register
scrolls within a bounded area to keep details reachable on desktop and mobile.
Draft refresh preserves typed terms; submitted terms remain read-only.

Populated Chromium acceptance passed creation/editing, submission, audited
super-admin exception approval, exact-decimal letter download, delivery
recording and acceptance. Light/dark checks passed at 1440px and 390px with no
page overflow or browser errors. Twenty-three recruitment integration tests
cover real API/DB scope, approval separation, immutable terms/history, expiry,
precision, headcount races and existing interview/pipeline workflows. No legacy
CSS was retired. Next safe slice: Create Employee from Offer using accepted
offer terms and the established employee draft/approval/hire authorities.


### HR Create Employee from Offer

Delivered the accepted-offer handoff register and immutable source summary,
employee draft form, approval progress, agreed assignment action and existing
governed hire panel. Shared Tailwind tokens and shadcn controls support light and
dark modes, keyboard focus, explicit failures and empty prerequisites. Typed
employee details survive refresh. Offers link directly to this handoff screen.

Future profile assignments stay reachable through the authorized assignment API;
SQL date text preserves exact joining dates across timezones. Initial assignment
and hire dates must match accepted terms. Duplicate identities and repeated
requests cannot create another employee; hire approval alone advances recruitment.

Populated Chromium acceptance passed draft, profile approval, agreed assignment,
hire request and approval at 1440px and 390px in both themes without page overflow
or browser errors. Sixteen affected integration tests and 36 HR router unit tests
passed, alongside typecheck, API/catalogue parity, production build and whitespace
checks. No legacy CSS retired. Next safe menu slice: Shifts & Rules.


### HR Shifts & Rules

Delivered the company-scoped live shift register and rule editor using Tailwind
semantic tokens and shared shadcn controls. Both themes include explicit empty,
permission, loading, stale-version, protected-reference and successful-save states.
The editor supports fixed/multiple/night/flexible working windows, paid/unpaid
breaks, thresholds, weekly off days, active work-location search and IANA timezone
selection. Weekly cycles choose configured member shifts and provide an anchored
server-resolved date preview. Protected rules can be copied to a new code.

Refresh preserves draft input, current/future assignment and rotation references
protect history, and Work Locations cannot be closed under active shifts. Browser
acceptance passed creation/editing, status changes, paid breaks, overnight shifts,
rotations, reference errors and copy workflow in light/dark at 1440px/390px without
page overflow or browser errors. Shift + foundation integration: 27 passed; HR
router unit tests: 36 passed. Typecheck, API/catalogue parity, production build and
whitespace checks passed. No legacy CSS removed.

Next safe menu slice: Shift Assignments using the shared shift records and
effective-dated employee/department/branch allocation authority. Keep precedence,
company/location checks, employment eligibility and historical evidence on the API.


### HR Shift Assignments

Delivered the live company allocation register, scope/date/shift editor, explicit
replacement confirmation, end/cancel forms, immutable history and related-record
navigation. Employee preview shows effective placement, scoped priority, fallback
choices and the resolved weekly-rotation member for a date. Bidirectional links
connect Shifts & Rules. Shared Tailwind tokens and shadcn controls support light /
dark themes, narrow layouts, keyboard focus and explicit error/empty/loading states.

Draft input survives refresh. Versioned replacement retains previous intervals;
closing/cancellation cannot rewrite finalized attendance. Employment coverage,
site, organisation availability and shift-rule protections remain server-owned.
Browser acceptance covered all create/replace/end/cancel/preview/history flows at
1440px and 390px in both themes without page overflow or browser errors. The
allocation + shift + HR foundation integration suites passed 37 tests; the HR
router unit suite passed 36. Typecheck, API/catalogue parity, production build and
whitespace checks passed. No legacy CSS retired.

Next safe menu slice: Daily Attendance. Reuse the dated operational-placement and
shift-resolution authority, raw punch evidence and existing attendance-period
locks. Keep derivation, corrections and approval boundaries distinct.


### HR Daily Attendance

Delivered the live company/date attendance register, search/clear/refresh,
bounded navigation, current-page metrics and raw-evidence review. Mobile rows
use accessible cards with directly available review actions; desktop keeps a
dense scrollable table. Semantic Tailwind tokens and shared shadcn controls
cover both themes, loading, empty, denied and error states. Dark status text
contrast and detail typography were corrected. No legacy CSS retired.

The UI reads the independent API and never substitutes fixtures. The server
owns effective placements, shift precedence/rotation, timezone windows, punch
pairing, approved corrections, exact leave-day evidence and anomaly flags.
Raw evidence has separate permission gating; refreshing does not mutate locked
attendance or payroll. Counts explicitly describe the current page.

Validation passed: ten attendance integration tests, fifteen derivation/rotation
unit tests, existing HR regression suites, real authenticated Chrome workflows
in light/dark at 1440px and 390px, typecheck, generated API/catalogue parity,
production build and git diff --check. Next safe slice: Monthly Attendance using
the same daily derivation, with bounded date ranges and finalized input history
kept distinct from operational calculations.


### HR Monthly Attendance

Delivered live monthly search/filter/pagination, employee summaries, a dated
calendar, selected-day evidence and contextual Daily Attendance navigation.
Finalized locked-month summaries have a separate permission and remain distinct
from operational totals. New responsive Tailwind/shadcn UI uses a dense desktop
table, mobile cards and a seven-column calendar with short mobile codes, legend,
weekday alignment and full accessible day labels. Daily Attendance now shares
status/formatting components and accepts a validated navigation reference.
No legacy CSS removed.

Validation passed: 18 monthly/daily PostgreSQL integration tests, 54 focused
unit tests, real authenticated Chrome actions and contextual links, light/dark
layouts at 1440/768/390px without page overflow/browser errors, typecheck,
API/catalogue parity, production build and whitespace checks. Shared batch
loading avoids employee/day request loops. Next safe screen: Attendance
Corrections, retaining approvals, immutable punches and locked-month protections.


### HR Attendance Corrections

Delivered the live request register, employee/date evidence lookup, draft editor,
manager/HR decision form, versioned history, explicit override confirmation and
contextual Daily Attendance navigation. Shared controls and semantic tokens cover
light/dark, permission/error/empty/loading states, dense desktop tables and mobile
cards. The native datetime control now fits narrow/tablet columns, with explicit
shift-timezone UTC offsets for reliable overnight/DST inputs. Refresh preserves
draft text; server-derived action availability remains authoritative. No legacy
CSS removed.

Verification passed: 32 attendance PostgreSQL integration tests, 58 focused unit
tests, production build, typecheck, generated API/catalogue parity, whitespace
checks and real browser workflows at 1440/768/390px. Browser acceptance covers
explicit governed super-admin overrides; ordinary three-actor approval is proven
in integration, with the independent multi-user browser gate retained separately.
Next safe screen: Overtime. Preserve approval, monetary-policy, period lock and
payroll-settlement boundaries.


### HR attendance completion — Overtime, Period Close and Payroll Inputs

Delivered three live API workspaces using shared Tailwind/shadcn controls and
semantic theme tokens. They share company/month navigation, responsive summary
cards, paginated registers, evidence/exception drill-through and immutable daily
payroll input traces. Forms have stable labels, explicit override confirmation,
version/hash capture and refresh-preserved text. Keyed API reads ignore stale
responses; company/month switching is disabled while editing. No legacy CSS or
existing attendance views were removed.

Attendance & Shifts is now 8/8 API-connected; total HR coverage is 37/76 (48.7%),
with 39 prototype pages remaining. Validation passed: 80 PostgreSQL integration
tests, 68 focused unit tests, authenticated connected browser workflow, final
live-label/local API reads, responsive light/dark layouts at 1440/768/390 pixels,
typecheck, focused ESLint, generated API/catalogue checks, production web build
and whitespace checks. Browser mutation records were isolated synthetic data.
Monetary payroll posting and controlled post-lock adjustments remain future
Payroll work; v5 attendance inputs do not calculate or pay salaries.

Next safe phase: all six Time & Leave pages together. Preserve approved per-day
leave/ledger authority, fractional-day reconciliation, actor separation, employee
placement scope and locked attendance protections. See the delivery plan's latest
attendance completion section for backend contracts and acceptance boundaries.


### HR Time & Leave — connected six-screen delivery

Delivered live Leave Types, Leave Balances, Leave Requests, Add Leave Request and
Leave Approval workspaces, plus the Time & Leave Attendance route using the
existing live daily view. Shared form fields, keyed data reads, status/metrics and
decision history now live in hr-workspace-controls.tsx and are reused by attendance
completion. Responsive cards, working-day calendars, immutable ledger history,
source drill-through and explicit override/cancellation decisions preserve ERP
connections. Native fieldset borders and dense control typography were normalized;
date controls fit 320px layouts. No legacy CSS was removed.

Exact full/half-day leave now connects through approvals, usage/reservations,
attendance corrections and finalized paid/unpaid payroll inputs. Historical closed
placements retain valid date coverage. Approved cancellation uses independently
authorized reversing entries and still respects locked attendance periods.
Entitlement postings are explicit authorized actions; recurring automated jobs and
verified gender-profile authority are separate extensions, not silently simulated.

Validation passed: 96 integration and 75 focused unit tests, complete authenticated
browser workflow, final local API reads, Live labels, origin/authentication/CSRF
checks, light/dark layouts at 1440/768/390/320px without page overflow, typecheck,
focused ESLint, generated contract/catalogue parity, production build and whitespace
checks. Browser mutations used isolated synthetic data. Local schema is HR53.

Current coverage: 43/76 HR menu screens API-connected (56.6%), 33 prototype.
Time & Leave is 6/6; Attendance & Shifts remains 8/8. Next safe phase is the ten
Payroll pages together, with locked v5 attendance inputs, real monetary policy,
approval/posting separation and Finance integration. See the delivery plan's latest
section for scope and production acceptance boundaries.


## 20 October 2026 — connected Payroll configuration and approval foundation

Payroll now renders the connected HrPayrollWorkspace for all ten menu pages.
The old deterministic Payroll renderer no longer takes precedence. No mock
amounts, demonstration calculations, journal proposals or bank confirmations are
presented as persisted business records.

**This is a partial Payroll delivery, not completion of the whole module.**
Five pages have live configuration/approval workflows:

| Page | Delivered behavior |
| --- | --- |
| Pay Components | Company accounting account validation, fixed/formula metadata, bounded arithmetic grammar validation, immutable terms, activation/deactivation and dependency checks. Formula execution is not delivered. |
| Salary Structures | Explicit currency, exact fixed amounts or validated formula overrides, unique ordered components, immutable composition and dependency validation. |
| Salary Revisions | New effective-dated compensation assignment drafts, frozen component snapshots, submit, independent approve/reject and maker cancellation. Overlapping approved assignments are blocked. |
| Payroll Inputs | Exact one-off adjustment drafts, submit and independent approval/rejection, plus navigation to the existing locked attendance input authority. |
| Loans & Advances | Draft/submit/independent decision, exact interest-free recovery schedules with no lost remainder. Approval does not disburse funds, activate a loan or consume an instalment. |

The other five pages (Payroll Runs, Payroll Review & Approval, Payroll Journal,
Payment Batch, Payslips & Payment Handoff) are **connected read-only inspectors**
of the existing period/result, journal, batch and immutable release authorities.
Payslips show released results only. Their menu status is explicitly Read only,
their heading is Connected · read only, and their pending execution work is
visible. They have no fake Calculate, Post, Pay or Release action. Connected
read-only pages do not show the prototype/no-API toolbar. Their existing Finance
and bank authorities have not been bypassed.

HR54 is additive: versions and governed flags preserve legacy records as
read-only; new structures carry explicit currency; the workspace has immutable
transactional events. Every new write checks tenant/company/action permissions,
trusted origin/CSRF, impersonation, exact expected version and evidence hash,
company serialization, idempotency, and platform audit. The final SQL update
also predicates on the reviewed version. Decisions include the maker, submitter
and currently bound employee user in the actor separation check. An explicitly
confirmed self-decision still requires a real governed super-administrator role
and override grant; a forged role in context fails the authority writer.
Salary/adjustment/loan terms cannot be backdated across a calculated/finalized
Payroll period. Configuration, salary snapshots and workflow evidence remain
immutable. Existing database exclusion constraints prevent approved salary overlap.

The interface uses shared Tailwind/shadcn controls, semantic theme tokens, compact
record cards, accessible field labels, record drill-through, workflow history,
paginated/searchable reads, and stable forms and decision evidence during refresh.
Employee options follow the form's effective date. Filters which would move a
draft or review to another company/period are disabled until it is closed. Live
API pages use API loading/error states instead of prototype simulation controls.
No legacy feature CSS or unrelated business records were deleted.

Validation: 49 affected PostgreSQL integration tests (22 Payroll, 16 Time & Leave,
11 Attendance completion) and 65 unit/API tests (22 Payroll arithmetic/contracts,
7 Payroll route boundary and 36 existing HR routes) passed: **114 unique tests**.
Cases include normal independent approval, explicit real browser override, forged
override rejection, immutable history/terms, concurrent replay, stale evidence,
salary overlap/currency/employee scope, account ownership, reactivation dependencies,
calculated-period protection, exact loan remainder, authentication, origin, CSRF,
bounded contracts and unavailable posting actions. Browser writes used a dedicated
synthetic company in the isolated test database. All ten views and five unsaved
editors passed light/dark checks at 1440/768/390/320 pixels without page overflow
or browser exceptions; refresh retained typed data. Normal multi-user browser
sign-in acceptance remains separate: independent actors were verified through
repository integration tests, while the browser used a real explicit override.
Typecheck, focused ESLint, API/catalogue parity, production web build and whitespace
checks passed. The local database is HR54; local browser checks are read-only.

Coverage is now **48/76 Live menu screens (63.2%), five additional connected
read-only Payroll screens, and 23 remaining prototype screens**. API access on
53/76 screens is not a claim that 69.7% of production HR requirements are complete.
Payroll has five connected workflows and five connected inspectors; it remains
in development. The earlier 43/76 figure describes the previous phase.

Safe resume remains **Payroll as one module**. Complete salary successor approval
which explicitly closes a prior open-ended approved assignment without corrupting
its historical coverage; the current workspace safely rejects that overlap.
Complete governed Payroll policy configuration and period execution, safe decimal
formula evaluation, exact salary segment proration against attendance_close_v5,
released monetary overtime/employee arrangements, explicit jurisdiction and sealed
statutory execution evidence, adjustment/loan consumption, calculation/recalculation
evidence and independent review/approval. Then complete the existing Finance
approval/journal binding, journal posting, governed encrypted payment-profile/batch
handoff, bank confirmation and payslip release boundaries. Test those mutations
end-to-end before promoting the five read-only screens. Do not move on to Performance
or call Payroll complete while these execution workflows are outstanding.


## 20 October 2026 — salary successors, exact calculation foundation and global typography

Salary Revisions now supports an explicitly selected approved predecessor.
Draft creation captures its exact version/hash. Independent successor approval
atomically ends the predecessor on the calendar day before the new salary starts,
records both histories/platform audits and approves the successor. The old salary
stays approved for its historical range; original component amounts and approvals
are retained. A rejected successor does not change the old salary. Version/hash
checks, frozen Payroll period gates, original overlap exclusions and deferred
database constraints protect the transition. Closed salary history is immutable.
HR55 adds the references/closure constraints; HR56 repairs the development
month-end interval expression. Both fresh and incremental migrations use the
correct expression. The generic Payroll adapter now distinguishes PostgreSQL
calendar DATE values from timestamps, avoiding timezone-induced previous-day
display and closure errors. Browser acceptance exercised the actual successor
editor, submission, real governed override and preserved predecessor history with
synthetic test records only.

The server-only payroll-calculation module provides exact rational monetary
arithmetic, four explicit rounding modes, a bounded arithmetic/function parser,
and fixed monthly salary calculation across approved effective salary segments.
Frozen attendance days must reconcile exactly, and every day needs one salary.
Formula components reference the unprorated contractual component base, then
attendance/employment proration is applied once. The engine identifies its
rounding stage as salary_segment_component. Unknown variables, division by zero,
unsupported compensation bases, duplicate dates/components, negative component
amounts, uncovered/overlapping salaries and invalid money precision fail closed.

**The mathematical engine is not yet connected to Payroll Runs or persisted
statutory/Finance/payment execution. This does not complete the requested Payroll
phase.** The five execution screens remain explicitly read-only, and their
catalogue status has not been promoted. Remaining work is still governed policy
configuration, released statutory/monetary overtime execution and evidence,
adjustment/loan consumption, persisted calculation/recalculation, independent
run review/approval, Finance approval/posting integration, encrypted payment
handoff/confirmation and payslip release. No tax jurisdiction/rates or bank
confirmation were guessed and no financial authority was bypassed.

Global sans-serif typography is corrected centrally. The existing Source Sans 3
and Geist Mono font variables now attach to html, where the root typography
tokens resolve, instead of only to body. The legacy serif/display aliases and
Tailwind sans/serif utilities consume --nx-font-sans. Monospace code/identifier
styling retains --nx-font-mono. No individual page font overrides were added.
The already selected application font is preserved. Future font changes use
app/layout.tsx and app/shared/styles/typography.css; semantic colours remain in
app/shared/styles/theme-colors.css and the Tailwind token mapping in app/globals.css.
There is no new theme settings interface or per-page font configuration.

Verification passed: 51 affected database integration tests and 87 unit/API tests
(138 unique tests), typecheck, focused ESLint, production web build, generated
API/catalogue parity and whitespace checks. Salary browser acceptance passed
at 1440/768/390/320 pixels in both themes. Global font checks inspect computed
body, heading and form-control families on login and representative Payroll,
Leave, Organisation, Banking and dashboard screens; light/dark and all four
widths passed without page overflow or browser exceptions. Local migration is
HR56. Normal web/API remain on 3000/4000; browser mutations used the isolated DB.
Screen coverage remains 48 Live, five connected read-only and 23 prototype.
The next work remains completing Payroll execution, not another HR module.


## 20 October 2026 — persisted Payroll runs and approved input assembly

Payroll Runs and Payroll Review & Approval now use the independent versioned API
through HrPayrollRunsWorkspace. Their menu/search/catalogue status is **In progress**,
with CONNECTED_API_IN_PROGRESS evidence. These two screens support mutations and
are no longer described as read-only. Payroll Journal, Payment Batch and Payslips
remain connected read-only views. No unfinished financial workflow was promoted
to Live. Current HR menu counts: **48 Live, two connected In progress, three
connected read-only, 23 prototype (76 total)**. These are screen categories, not a
weighted estimate of overall HR completion.

The implemented run path is governed policy creation, period opening from locked
attendance_close_v5 inputs, persisted fixed monthly salary calculation, immutable
recalculation, maker submission and independently controlled return for correction.
Policy precision must match active Finance currency; its net payable mapping must
be an active company liability account. Results retain frozen attendance references,
approved effective salary snapshots, component lines, salary segments, engine and
rounding evidence. Header/daily paid/unpaid quantities must reconcile exactly.
The synchronous boundary is 500 employees and 1000 approved one-off inputs;
larger populations fail explicitly pending durable worker execution.

Approved one-off earnings and deductions are now included using the period salary
currency and explicit rounding policy. Original four-decimal input values and
approval evidence are retained. Calculation does not consume them. Final approval
and source consumption share one transaction, version predicates, immutable source
history and platform audit. The deferred database constraint prevents a consumption
commit without current-run approval. Pending inputs, employees outside published
attendance and deductions exceeding gross pay fail closed. Existing calculated-
period correction protections remain intact. Recalculation keeps earlier results.

HR57 adds governed run/policy state and execution evidence; HR58 adds input
consumption invariants; HR59 repairs the polymorphic trigger's record-field access
so component and structure activation continue working. Local and isolated test
databases are at HR59. The normal web/API remain available on 3000/4000 with the
current API compiled and restarted. The temporary 4101 test API is stopped after
verification. No synthetic business records were written to the normal database.

Verification passed: 71 affected database integration tests and 90 unit/API tests
(161 unique tests), typecheck, focused ESLint, production web build, generated API
and catalogue parity, and git diff --check. Browser acceptance used synthetic
isolated data for policy/open/calculate/recalculate/submit/return, an explicit
governed administrator review override, disabled statutory approval, preserved
form context on refresh, light/dark themes and 1440/768/390/320-pixel layouts.
Screenshots were inspected. Normal API authenticated run reads return 200,
anonymous reads return 401, and both screens load without the mock toolbar.
The two additional database consumption tests verify the persistence invariant;
they do not substitute for a real statutory executor or prove public final approval.

**The entire Payroll phase is still incomplete.** Final approval is deliberately
blocked without verified sealed statutory execution that reconciles to immutable
result lines. Remaining implementation is released statutory and monetary overtime
execution, governed loan recovery, the successful statutory-backed public approval
path, Finance journal approval/posting, encrypted payment handoff/confirmation and
payslip release. Existing localization SQL and older completion documents are not
evidence that these runtimes exist under server/api. The next work stays in Payroll;
do not start another HR module or claim final Payroll readiness from this batch.


## 20 October 2026 — global styling audit and next module order

The user explicitly confirmed the sequence: finish the complete Payroll execution
phase first, then implement **Performance Management as one connected module**.
The scope includes all four menu pages: Performance Cycles, Goals & KPIs,
Performance Reviews and Performance Outcomes. They currently render prototype
fixtures; none is promoted to Live by this planning update. Treat cycle dates and
rating scales, employee goals and weights, self/manager review, independent
calibration/acknowledgement and governed outcomes as one lifecycle. Approved pay
or movement outcomes must create linked Payroll/Lifecycle transactions; review
screens must not directly change salaries or placements. Verify tenant/company
scope, actor separation, histories, source versions, idempotency, API contracts,
UI states and responsive light/dark styling together before reporting completion.

The root AGENTS.md now requires inspecting global font/theme/colour consistency
on every page/component task, resolving affected overrides, preserving explicit
artwork/print exceptions and recording browser evidence. The repeatable audit is
scripts/audit-ui-theme.mjs; its generated findings are in
docs/architecture/global-theme-audit.md. The initial static baseline is 0/62
feature view files with direct non-token font families (0.00%), and 5/62 with
direct fixed colours (8.06%). Across 204 application source files, ten files have
47 candidate colour lines, including shared controls. This is not a percentage
of the 802 rendered routes: shared renderers, dependencies and runtime states
need route-level inspection. No broad colour replacement or unrelated business
logic change was performed during this audit. The root sans/mono font setup,
semantic theme tokens and existing UI behavior are preserved.


## 20 October 2026 — monetary overtime integrated into Payroll results

The supported monetary overtime path now runs inside the existing Payroll
calculation transaction. It reconciles frozen daily/category quantities to approved
requests, retained operational rule identity/hash and effective salary snapshots.
Each day requires exactly one approved employee monetary arrangement and an
effective released policy/option, matching currency precision, permitted
compensation/payment basis and an active earning expense mapping. The operational
attendance multiplier is never used as the monetary multiplier.

The engine uses exact rational arithmetic with explicit intermediate precision,
ordinary-hour conversion, monetary multiplier, rounding mode/stage and final
currency scale. Fixed selected earning components use their approved contractual
snapshot amounts, without attendance proration being applied a second time.
Explicit direct contractual rates are also supported. Direct-hourly conversion
cannot reinterpret a monthly selected component as an hourly amount. Daily,
weekly, monthly and annual conversion math requires an explicit divisor and a
matching salary payment basis. The existing Payroll base engine still supports
fixed monthly salaries only; pure overtime arithmetic tests for other bases do
not imply those compensation models work in the full run. Custom-step conversion
and formula-based selected components remain explicit unsupported cases, never
guessed or silently omitted.

Period rounding uses deterministic cumulative deltas within the employee/option
group. Tests verify two one-minute claims produce 7.76 with per-day rounding and
7.75 with period rounding, with retained per-day evidence summing exactly to each
result. Recalculation creates a fresh immutable result and evidence set.

Result items and hr_payroll_ot_evidence retain request, operational rule, released
policy version/option, arrangement, salary assignment/segment, basis components,
rate, minutes/hours, multiplier, conversion, rounding and calculation hashes.
The shared run response now includes optional overtime evidence per line. The
Payroll Runs/Review employee drilldown displays that evidence with semantic tokens
and the global font, including long policy/arrangement identifiers on small screens.

HR60 seals released policy identity and child insertions and approved arrangement
selections while preserving draft changes. HR61 also guards updates that attempt
to reparent a draft child into sealed authority. Tests exercise immutability and
the reparenting bypass. Normal and isolated databases are now HR61. The current
normal API was compiled/restarted on 4000; web remains on 3000. Browser writes
used only synthetic isolated data. The temporary 4101 API is stopped after checks.

Verification passed: 83 database integration tests and 107 unit/API tests
(190 unique tests), typecheck, focused ESLint, generated API/catalogue parity,
production web build and git diff --check. The additional overtime coverage is
12 database and 17 arithmetic tests. Browser acceptance calculates a real saved
result from synthetic released monetary authority, inspects its rate/authority
evidence and checks both themes at 1440/768/390/320 pixels with no page overflow
or browser exceptions. Screenshots were inspected. Normal run API reads return
200 when authenticated and 401 anonymously; both connected screens load.
The global theme audit remains 0% direct font exceptions and 8.06% direct colour
exceptions among 62 feature view source files; no new override was introduced.

**Payroll as a whole is still incomplete and is not promoted to Live.** The
monetary policy/employee arrangement management API and editor are not delivered
by this batch; tests provision their authorities directly as synthetic fixtures.
Continue that governed setup boundary, then statutory resolution/execution and
setup inputs, loan recovery, successful statutory-backed public approval,
Finance approval/journal posting, encrypted payment handoff/confirmation and
payslip release. The three Finance/payment/payslip screens remain read-only.
Performance Management remains the next whole module only after Payroll passes
its completion gates. Menu totals remain 48 Live, two In progress, three connected
read-only and 23 prototype; these are not a weighted completion percentage.


## 20 October 2026 — governed monetary overtime setup API and screens

Pay Components now contains an expandable **Monetary overtime policies & employee
arrangements** workspace. It preserves the existing pay-component editor and all
other Payroll navigation. Company policy drafts capture effective dates, approved
source reference, fixed monthly earning basis or explicit contractual hourly basis,
earning expense component, currency/precision, ordinary hours, monetary multiplier
and intermediate/final rounding. Employee drafts inherit the released policy terms
and capture an explicit direct rate only when that policy requires one.

The connected lifecycle is policy draft → maker submission → independent approval
→ release, then employee arrangement draft → maker submission → independent
compensation approval → existing Payroll calculation/evidence. Policy creation
uses setup.manage, review/release uses period.approve, arrangement creation uses
salary.manage and arrangement approval uses salary.approve, with the corresponding
read permissions. This reuses existing reviewed permissions; it does not grant
financial authority through a new automatic role assignment. Makers and employee
beneficiaries cannot decide their own records without an explicit actual governed
administrator override. Override evidence, source snapshots, reasons, per-record
history and platform audits commit together with idempotent mutations.

All setup requests use the independent API and shared contracts/OpenAPI/generated
client. Reads are company scoped and paginated; employee/component/released-policy
lookups are bounded and disclose truncation. Validation checks active company
expense mappings, fixed earning snapshots, placement coverage, policy dates,
matching approved salary/currency precision and calculated-period correction
boundaries. Overlapping released policies or approved employee arrangements fail
atomically. Historical imported records remain read-only. Current supported
management is fixed monthly compensation with selected fixed earnings or an
explicit direct contractual hourly overtime rate; unsupported custom/formula
conversion is not presented as ready. Draft editing and automatic successor closure
of an existing open-ended released policy/approved arrangement are not supplied by
this batch; new records must have non-overlapping explicit ranges. Historical terms
are not silently rewritten to accommodate a new record.

HR62 adds governed setup markers, workflow versions, policy currency and lifecycle
guards. Submitted policy/selection children are protected against edits, deletion
and movement into or out of reviewed parents. The normal and isolated databases
are at HR62. The compiled normal API is restarted on 4000, with web on 3000.
The temporary 4101 browser-test API is stopped after verification. Synthetic
browser mutation records remain confined to the isolated database.

Visual inspection caught native input text using a browser colour inside portal
dialogs. Shared Input/Textarea and outline/ghost Button defaults now explicitly
use semantic foreground tokens; the shared dialog backdrop uses --nx-overlay-scrim.
This fixes portal controls without per-page font or colour palettes. Browser
checks assert that visible dialog input/select/textarea computed colours match
the global token in light/dark themes at 1440/768/390/320 pixels. Policy and
arrangement forms, audited overrides, retained history and the resulting Payroll
net calculation pass end-to-end. Screenshots were inspected. Representative
Payroll, Leave, Organisation, Banking and dashboard font/layout checks also pass.
The stale configuration notice now points to the implemented calculation screens.

Verification: **99 database integration tests and 111 unit/API tests (210 unique)**,
typecheck, focused lint including affected shared controls, generated API/catalogue
parity, production web build, theme audit and git diff --check passed. Normal
policy/arrangement reads return 200, anonymous reads 401, and the expanded setup
screen loads; normal smoke checks perform no business writes. Sixteen new
integration tests cover the complete management-to-calculation path and four
new route tests cover bounded reads, validation, idempotency forwarding, CSRF
and trusted origins.

The updated static audit counts 0/63 direct font exceptions (0.00%) and 5/63 view
files containing fixed colours (7.94%). The view percentage changed because one
new view file was added, not because those five existing views were repaired.
The shared dialog colour exception was repaired: nine application files now
contain colour candidates, down from ten. These are source-file measures, not
verified percentages of the 802 menu routes.

**Payroll is still unfinished.** Next implement statutory setup/resolution/
execution and retained reconciliation evidence, governed loan recovery, the
successful statutory-backed public approval flow, Finance approval/journal posting,
encrypted payment handoff/confirmation and payslip release. Keep the three
Finance/payment/payslip screens read-only until their mutations are delivered and
verified. Performance Management remains the next whole module after Payroll's
completion gates. Menu counts remain 48 Live, two In progress, three connected
read-only and 23 prototype; no overall completion percentage is inferred.


## 20 October 2026 — published statutory runtime and Payroll evidence

Payroll Runs now executes the supported `safe_formula_v1` published-rule contract
after fixed monthly salary, monetary overtime and approved one-off inputs. Exact
arithmetic, explicit currency precision/rounding and reviewed positive, boundary
and non-applicable vectors are checked before any statutory output is retained.
Negative deductions exceeding earnings, unsupported schemas/engines/stacking,
missing accounting mappings and non-reproducing vectors block final approval;
they never become an assumed zero tax calculation.

Resolution requires a stable approved legal-employer profile, active country and
legal-entity references, monthly company currency configuration, effective employee
placement, reviewed work-location jurisdiction, complete active jurisdiction chain
and approved activated packs with immutable import releases. Required subnational
context is enforced. Different jurisdiction branches, employee overrides and
within-period changes remain explicit blockers pending segmented resolution.
Unimported activations are inspected and rejected rather than silently omitted.
Declaration/EOBI-base/YTD inputs are resolved only when referenced, with approved
facts, explicit tax-year recognition states and retained provenance. No country
rates or company statutory assumptions are embedded in this executor.

Ready results retain immutable sealed snapshot, pack/rule order, inputs, sources,
rounding/output hashes and result-line reconciliation. Final approval checks the
engine marker and exact result hash. Approved adjustment consumption is tested
through the real independent repository approval transaction, including replay
without double consumption. This is repository integration evidence, not a claim
that production statutory-backed HTTP approval has been delivered.

Synthetic acceptance packs require an explicit in-process repository test mode.
The normal API never enables it from a request or environment variable and rejects
synthetic releases/evidence for final approval. Synthetic percentages in fixtures
have no legal meaning. No production statutory pack or live company localization
data was created, and the existing publisher/importer management boundary still
needs a supported production release/setup workflow.

Payroll Runs and Review & Approval now show employer contributions separately
from employee net, per-employee statutory state, verified rule/pack counts and
retained snapshot fingerprints. Synthetic evidence has a visible testing label;
unresolved results retain specific warnings. Shared semantic controls, global
sans typography, responsive layout and both themes are preserved. The generic
configuration notice now reflects supported calculations and unfinished execution.

Verification: 82 Payroll database integration tests and 129 unit/API tests
(211 unique focused tests), typecheck, focused lint, generated API/catalogue
parity, production web build, theme audit and git diff --check. Browser checks
cover both changed routes, light/dark and 1440/768/390/320 pixel widths, visible
employer totals, evidence expansion and rejection of synthetic approval. Screenshots
were inspected. Normal API smoke checks are read-only; fixtures remain in the
isolated database. No schema migration was required (existing HR62 database).

Global source audit remains 0/63 view font overrides and 5/63 view files with fixed
colour candidates (7.94%); this does not measure all menu routes. No menu status
is promoted and no overall Payroll completion percentage is inferred.

**Payroll remains unfinished.** Continue production localization publishing and
governed company/work-location/declaration/parameter setup, segmented and unsupported
statutory engines, governed loan disbursement/recovery, production statutory-backed
HTTP approval, Finance approval/journal posting, encrypted payment handoff and
confirmation, and payslip release. Finance/payment/payslip mutation controls remain
read-only. Performance Management follows after Payroll completion gates.


## 20 October 2026 — governed statutory setup through API and screens

Pay Components now includes Statutory company & employee setup with six connected
sections: legal employer, monthly payroll currency, work-location jurisdictions,
published-pack activation, employee declarations and explicit contribution bases.
Draft requests use HR63's tenant/company-scoped review table. Submission preserves
the terms; independent approval materializes the existing shared statutory records
in the same audited/idempotent transaction. Rejection leaves business authority
unchanged. Existing canonical records remain reference data, not editable fixtures.

Declaration revisions must name the latest approved predecessor and start later.
Approved declarations/bases retain their native evidence hashes and independent
review requirements; administrator self-approval remains unavailable for them.
Other context decisions can use the existing explicit audited administrator
override. Approved managed legal/configuration/location/activation records and
request terms/history cannot be changed in place. Effective ranges are explicit;
automatic closure/correction of an open-ended approved context is not delivered.

Validation checks active country/jurisdiction/entity/currency data, company work
locations, employee placement, compatible reviewed profiles and released pack
provenance. Required subnational work-location context is enforced. Currency
configuration overlap and declaration successor conflicts are rechecked at
approval, with transaction rollback preserving the submitted request on failure.
Lookup results are bounded and include country filtering and employee search.

Draft/submitted statutory setup covering a calculated period blocks final approval.
Approving setup after a preliminary calculation also requires recalculation; actual
approval/calculation timestamps avoid transaction-start ordering errors. Submitted
and finalized Payroll periods reject context changes until their review/correction
workflow permits them. Payroll approval gates now link directly to statutory setup.

Normal API activation accepts compatible production import releases only. Test
fixtures use the existing explicit in-process repository test mode, and no public
request or environment variable enables it. No production legal rates, packs,
company facts or declarations were invented. Publishing/importing a reviewed
production rule artifact is still a separate missing management boundary.

Verification: 90 focused Payroll database integration tests and 135 unit/API tests
(225 unique), typecheck, focused lint, generated API/catalogue parity, production
web build, global theme audit and git diff --check. Integration proves all six
setup kinds through canonical materialization and a sealed synthetic Payroll run,
including overlap rollback, stale fingerprints, company/permission boundaries,
declaration successors, pending-review gates and recalculation after approval.
Six HTTP tests cover sessions, bounded reads, CSRF/origins, idempotency forwarding,
reviewed decisions and rejection of unknown execution-mode fields.

Chrome checks cover five draft/submission forms, three explicit audited context
approvals, independent-review notices, country filtering, and exclusion of synthetic
pack options. Legal, declaration and contribution forms were checked in light/dark
at 1440/768/390/320 pixels with global font/control-colour and overflow assertions.
Screenshots were inspected; the wide-dialog breakpoint was corrected and long forms
include a bottom close action. Normal API checks are read-only; HR63 is applied to
both local and isolated databases. Browser business mutations use isolated companies.

The source theme audit is 0/64 view font exceptions (0.00%) and 5/64 view colour
candidate files (7.81%). The denominator increased with this view; the five existing
colour exceptions were not repaired. These figures do not measure all menu routes.

**Payroll remains unfinished as a whole.** Continue the production publisher/import
workflow, unsupported/segmented statutory resolution, governed loan disbursement
and recovery, production statutory-backed HTTP approval, Finance approval/journal
posting, encrypted payment handoff/confirmation and payslip release. The three
financial execution screens remain read-only; no menu state or overall completion
percentage is promoted. Performance Management follows Payroll completion.


## 20 October 2026 — reviewed rule publication and statutory-backed HTTP approval

Rule publishing is now part of statutory setup. It accepts a bounded, self-contained
safe_formula_v1 bundle with explicit source-document fingerprints, rule definitions
and positive/boundary/non-applicable test cases. The same execution schemas are
shared through contracts, the documented API and generated client. Formula/vector
verification runs before create/submit/approve and again at privileged import.

The maker submits; a different reviewer requires Payroll period approval plus
platform.localization.activate. Administrator self-review is unavailable. Normal
API requests create/review proposals only: they never gain catalog publisher
authority. The new payroll:publish command requires DATABASE_PUBLISHER_URL for a
registered publisher or migration owner and the exact approved artifact hash.
It has no API credential fallback and does not alter/register database principals.
Least-privilege publisher registration/grants and operator steps are documented in
docs/architecture/statutory-rule-publishing.md.

HR64 adds immutable tenant/company-scoped publication acknowledgements and extends
the governed request kind. It also prevents changing submitted identities during
approval. The importer writes catalog identity/version/rules/vectors, immutable
release, acknowledgement and workspace history in one transaction; replay returns
the original result, and changed content cannot overwrite a published version.
Publisher identity is database-derived. Publishing does not activate a company pack
or invalidate an existing run until an actual reviewed activation changes its inputs.

The screen distinguishes approved/awaiting publisher from actually published,
shows canonical JSON and artifact/version fingerprints, and retains source/review
history. The editor and evidence view use bounded JSON areas, shared controls,
global fonts/colours and responsive dialogs. Synthetic classification remains visible
and requires an explicit publisher flag; it is excluded from production activation.

Verification: 97 Payroll database integration tests and 146 unit/API tests
(243 focused tests), typecheck, focused lint, API/catalogue parity, production web
build, global theme audit and git diff --check. New tests cover failed/replayed
publication, source/fingerprint/company boundaries, malformed vectors, unregistered
database rejection, and a registered non-owner publisher with minimal grants and
no UPDATE authority over approval requests. A production-classification path test
uses explicitly artificial data only in the isolated database and proves the normal
executor through successful independent HTTP final approval/replay. It asserts no
country rates or legal correctness and installs no normal-company rule data.

Chrome verifies draft/review/submission, an independent reviewer, the actual
publisher CLI, retained publication evidence and exclusion of that synthetic pack
from production options. Editor and evidence were checked in light/dark at
1440/768/390/320 pixels with global font/control-colour and overflow assertions;
screenshots were inspected. Normal local API smoke is read-only. HR64 is applied to
both local and isolated databases. The source audit remains 0/64 font exceptions
and 5/64 view colour candidates (7.81%); these are source measures, not route coverage.

This completes the supported rule-publishing workflow, not Payroll as a whole.
No production legal rates, company activations or publisher credentials were
invented. Remaining work includes unsupported/segmented statutory engines and
context correction, governed loan disbursement/recovery, Finance approval and journal
posting, payment handoff/confirmation and payslip release. Financial execution views
remain read-only; Performance Management follows Payroll completion. No menu status
or overall completion percentage is promoted.


## 20 October 2026 — governed loan disbursement and Payroll instalment recovery

Loans & advances now connects independent approval, the existing posted Bank
Payments workflow, actual bank confirmation and fixed monthly Payroll recovery.
Schedules use active Finance currency minor units without floating-point loss.
The screen lists up to 25 exact authorized payment matches, retains bank/journal/
receivable evidence and shows approved Payroll recoveries and scheduled balances.
Shared controls, global sans/semantic colours and responsive grids are preserved.

Confirmation requires company-scoped Banking read authority plus Payroll loan
approval, matching loan reference/employee/principal/currency and a receivable asset
account. Makers/employees cannot self-confirm or override this check. Immutable
disbursement evidence and activation commit together; replay rechecks authority.
Calculated Payroll prevents late funding. Linked Bank Payments cannot be reversed
under unresolved recovery history, including concurrent database writes.

Calculation retains exact instalment/source/account fingerprints in immutable
results and maps the deduction credit to the actual loan receivable. Recalculation
does not consume inputs. Final approval checks current evidence and atomically
consumes each instalment; the last settles the Payroll schedule. This commits a
Payroll deduction; it does not assert that a General Ledger journal is posted.
Overdue/unverified loans, inactive sources, missing attendance, currency/precision
mismatch and excessive deductions block rather than being omitted or capped.

HR65–67 are applied to normal local and isolated databases. HR67 also preserves
the generic trigger's component/structure status actions; the wider regression
suite caught and corrected its polymorphic field access. The earlier loan test now
expects PKR minor-unit schedules; four-decimal arithmetic remains covered separately.
Operator steps and supported limits are in docs/architecture/payroll-loan-recovery.md.

Verification: 110 focused Payroll/Banking database integration tests and 173 unit/API
tests (283 unique), followed by 31 loan/run checks after final authority hardening;
typecheck, focused lint, API/catalogue parity, production web build, theme audit and
git diff --check. Actual HTTP checks exercise authentication, CSRF, invalid evidence,
independent disbursement and final approval/replay with real business repositories.
Browser confirmation, exact payment selection and retained funded evidence were
checked in Chrome light/dark at 1440/768/390/320 pixels, including root/detail
overflow and global font/control-colour assertions; screenshots were inspected.
Normal local API smoke is read-only; financial acceptance writes use isolated data.
The source theme audit remains 0/64 font exceptions and 5/64 colour candidate views
(7.81%), across 206 application source files; these figures do not measure routes.

This completes the supported fixed, interest-free funding/recovery workflow.
Interest, catch-up, partial recovery, waivers, loan/schedule corrections and reversals
remain explicit unsupported workflows. Payroll as a whole remains unfinished:
continue Payroll journal review and Finance posting, then payment handoff/confirmation
and payslip release, alongside remaining segmented statutory/context correction
work. The financial execution views remain read-only and no menu status or overall
completion percentage is promoted. Performance Management follows Payroll completion.


## 20 October 2026 — governed Payroll journal and actual Finance accrual

Payroll Journal now has a dedicated connected screen and documented shared API:
preview, prepare, independent acceptance/rejection and separate General Ledger
posting. It derives the complete current approved run without accepting money,
accounts or FX values from the browser. Each employee's header/items, sealed
statutory execution, employer contributions, net pay and exact loan consumption
must reconcile before preparation. Rejected proposals retain immutable lines and
can be followed by a newly reviewed revision; historical proposals remain read-only.

The proposal freezes source/run fingerprints, posting date, currency/base currency
and Finance rate identity/value. Company-scoped Finance/Workflow permissions are
revalidated before every mutation and idempotent replay. Makers, submitters and
bound employees cannot self-review; a separate poster also excludes the Payroll
approver and journal acceptor. Administrator self-decision overrides are unavailable.
Acceptance advances the period to posting_ready; actual Finance posting atomically
creates the accounting event, numbered General Ledger entry, immutable acceptance
binding, posted Payroll states, audit/history and replay acknowledgement. This uses
the existing Finance posting service and its accounting authorities, not a duplicate
ledger or an invented generic Workflow approval instance.

Earnings and employer contributions debit expense. Deductions, contributions and
net pay credit their retained controls; a consumed loan instalment credits its funded
receivable asset. Actual bank principal less posted Payroll recovery is verified in
the ledger. Posting does not consume loan inputs again. Source/posted line multiset
comparison rejects balanced duplicate lines, and reviewed lines cannot be appended.
Direct Payroll Finance reversal remains blocked pending a governed correction flow.

HR68–72 are applied to both normal local and isolated databases. Preview readers use
explicit non-locking Finance authority reads; write callers retain locking defaults
and the common rate-authority lock order. Closed/ambiguous periods, inactive or
misclassified accounts, changed FX authority, unsealed/unsupported sources and base
rounding imbalance block execution. Required accounting dimensions need a governed
allocation mapping. Non-parity foreign-currency loan carrying values need an FX
allocation workflow; no accounting allocation or balancing adjustment is guessed.
Supported synchronous limits are 500 employees, 10000 result items and 1000 journal
lines. Posting dates currently stay within the Payroll month and no later than today.
Operator steps and limits are in docs/architecture/payroll-journal-posting.md.

Verification covers 121 focused Payroll/Banking database integration tests and 214
unit/API tests (335 unique), with targeted reruns after final safeguards. Tests prove
normal statutory-executor HTTP acceptance/posting, authentication/CSRF/validation,
independent actor/company scope, replay/revocation, concurrent posting, real ledger
balances, closed-period rollback, immutable evidence, duplicates and historical rows.
Production-classification arithmetic fixtures are isolated test data only; they assert
no legal rates or country compliance and add no normal-company business transactions.
Typecheck, focused lint, API/catalogue parity, production web build, global theme
write/check audit and git diff --check pass. Normal local smoke is read-only.

Chrome verifies preparation and actual posting, retained source/entry evidence and
primary-action contrast in light/dark at 1440/768/390/320 pixels, including root/view
overflow and global font/control-colour assertions. Screenshots were inspected;
button foregrounds explicitly follow the shared action-text token. All new UI uses
shared controls, semantic colours and the global sans font. Source audit: 0/65 font
exceptions (0.00%), 5/65 view colour candidates (7.69%), 207 application source files,
9 colour-candidate files/46 lines overall. The five existing colour exceptions remain;
the denominator changed with this view. These are source measures, not route coverage.

Payroll Journal alone moves from read-only to Live and its catalogue renderer now
matches the actual workspace. HR menu counts are 49 Live, 2 In progress, 2 read-only
and 23 prototype screens (76 total). This is not an overall completion percentage.
Continue encrypted Payroll payment handoff/release and confirmation, then payslip
release, plus remaining statutory segmentation/context corrections and the explicitly
blocked dimension/FX/correction workflows. Payment and payslip views remain read-only;
Performance Management follows completion of Payroll as a whole.


## 2026-10-21 — Payslips complete; Banking integration explicitly deferred

The user assigned Banking to another developer. This supersedes the previous
payment-release priority: leave Banking development and payment linking deferred,
then deliver the next independent Payroll screen. Payment Batch remains read-only.
The new payment-integration endpoints explicitly return an authenticated 409
HR_PAYMENT_BANKING_INTEGRATION_DEFERRED; no payment action is enabled in the UI.
This turn's Banking service posting/reversal additions were removed without
discarding existing work. HR76 deactivates the salary allocation/reversal triggers
introduced during the earlier experiment. Applied migrations HR73–75 remain as
schema history and preparation for an agreed future handoff. Their acceptance
cases are explicitly parked, not counted as passing current-phase coverage.

Payslips now uses a dedicated API workspace, bounded company/month/search/status
queries, current posted results, exact earnings/deduction/employer reconciliation,
independent selected-employee release (1–50 per command), source fingerprints,
atomic audit/publication writes, immutable publication snapshots and idempotent
replay with current authorization checks. The Payroll maker/submitting actor and
bound employees cannot self-publish through an override. All private reads require
company-scoped payslip/result authority and send Cache-Control: no-store.
HR77 adds the frozen document boundary and DB provenance/independence guards.

Preview, Open, Download and Print work from the real API. A released document
freezes employee/company labels, immutable calculation lines/totals and Finance
accrual references. A later employee rename does not rewrite the published slip.
Historical releases retain immutable result amounts and identify current labels
where no original publication snapshot existed. Payslip release leaves the Payroll
state posted and creates no Banking transactions. The document explicitly states
that publication does not establish payment. Delivery here is an escaped standalone
HTML download with print-to-PDF support in the browser; it is not a signed PDF,
email notification or a completed employee self-service portal.

Verification: 37 Payroll integration tests pass (6 new Payslip, 11 accrual and 20
run cases); 94 focused unit/API tests pass, including exact reconciliation, escaped
printable output, privacy/auth, CSRF, no-store, immutable labels, stale/foreign IDs,
revoked authority on replay and competing releases. Focused lint, typecheck,
generated API/catalogue parity, production web build, global theme audit and
git diff --check are required for handoff. Chrome verifies preview, real release,
Open, downloaded HTML and print invocation, plus root/workspace overflow, shared
sans font/control colours and primary action contrast in light/dark at
1440/768/390/320 pixels. Screenshots were visually inspected. Normal local smoke
is read-only: Payslip API 200, guest 401, no-store, payment-link 409 and connected
screen; no normal-company salary/payment/publication facts are created by testing.

Global source audit: 0/67 font exceptions (0.00%), 5/67 view colour candidates
(7.46%), 210 application source files and 10 colour-candidate files/47 lines.
The added colour declaration belongs to the deliberately monochrome standalone
print document; the interactive page uses semantic shared colours. This is source
coverage, not a percentage of menu screens. The dormant payment view is included
in the source denominator and is not an active Live route.

Payslips alone moves from read-only to Live and is titled Payslips, with the
catalogue renderer matching HrPayslipsWorkspace. HR menu: 50 Live, 2 In progress,
1 read-only and 23 prototype screens (76 total). This is not an overall HR
completion percentage. Payroll is not declared wholly finished: Banking payment
integration is intentionally deferred; published legal pack setup, segmented
statutory/context corrections, required dimension/FX allocations and governed
Payroll corrections retain their documented limits. Next non-Banking delivery
can proceed to Performance Management; coordinate the payment contract only after
the Banking owner's handoff. No external bank transfer or message was sent.


Final handoff checks (2026-10-21): all 37 focused Payroll integration and 94
unit/API tests passed (131 total), focused lint/typecheck passed, the final
production web build passed, generated API/catalogue checks passed, shared-theme
write/check audit passed and git diff --check passed. HR77 is installed on both
the isolated and normal local databases. Normal API 4000 and web 3000 are running;
normal read-only smoke passed (200 / guest 401 / no-store / deferred link 409).
Banking remains a separate owner's task; only the new Payslips route is Live.


## 2026-10-21 — Connected Performance Management staff workflow

Delivered Performance Cycles, Goals & KPIs, Performance Reviews and Performance
Outcomes as one connected API workspace. The dedicated renderer now takes
precedence over the old lifecycle prototype; the menu and generated catalogue
match the actual runtime renderer. The four pages are Live after verification.
Banking and the deferred Payroll payment link are outside this phase and remain
owned by the other developer. No Banking source was changed during this phase.

Cycles have ordered start/end/review dates, activation, draft cancellation and
closure controls. Company employee eligibility uses employment history overlapping
the cycle. Goals have measurable targets, due dates and exact basis-point weights,
independent approval and audited reopening before review submission. All active
employee goals must be approved and total exactly 100% before a review can proceed.
Reviews retain approved goal IDs/versions/terms, observed-achievement evidence,
integer ratings, the exact weighted score and rating-model identity. Submission
waits for the cycle end; an independent officer publishes the immutable result.
Goal changes invalidate draft review evidence, and submitted/published reviews
freeze their goals. Outcomes require a published review, a company follow-up owner,
plan and due date, independent approval and explicit completion evidence. A cycle
cannot close with an unreviewed employee, unpublished review or unfinished outcome.

Dedicated company-scoped read/manage/review/publish permissions are checked against
current active account/role/policy/grants, including before idempotent replay.
Existing all-authority administrator policies receive the new permissions; ordinary
roles need explicit assignment. HR80 preserves the authentication boundary's
normalized/compatibility permission parity. The boundary rejects impersonated
mutations, stale versions, cross-company references, self-decisions, browser-supplied
scores or money, hidden overrides and duplicate employee reviews/outcomes. Writes,
audit events and idempotent acknowledgements are atomic. HR78–80 preserve tenant
RLS, company foreign keys, immutable final evidence/events and database source/score
checks. Private workspace responses send Cache-Control: no-store.

Supported scope is an HR staff manager-review workflow with a fixed five-point
weighted model and one combined follow-up outcome per published review. Optional
employee self-assessment/acknowledgement, 360-degree reviews, configurable scales,
multiple appraisal panels and automated training enrolment are separate future
capabilities. These are not represented as delivered by the Live page labels.
Promotion recommendations do not alter employee assignments or compensation;
those need their own governed employee-movement/Payroll approvals. This phase
does not claim all HR work, or every possible Performance feature, is complete.
Interactive reads are bounded (50 records/page, 50 goals/employee, latest 100 cycle
choices, 2000 cycle records, 500 goal sets/published review choices); oversized
cycles show an explicit notice and are not silently presented as complete.

Verification: 10 Performance integration tests and 6 completed-Payslip regression
tests pass, plus 22 Performance unit/API tests (38 focused tests). Coverage includes
the complete cycle-to-completed-outcome path, exact weights/scores, independent
decisions, goal revision/staleness, immutable publication/audits, company boundaries,
revocation on replay, racing publication, future-period submission and administrator
authorization parity. Chrome verifies actual activation/goal approval/publication/
outcome approval/completion plus Review/Outcome draft saves. All four pages and
draft forms were checked in light/dark at 1440/768/390/320 pixels, with overflow,
global sans, control-colour and primary-action assertions. Final screenshots were
visually inspected; phone search fields stack and published goal details use retained
human-readable names/weights. The existing draft Cycle/Goal forms are also inspected
in the responsive browser pass. No test data is inserted into normal company workflows.

Global source audit: 0/68 view font exceptions (0.00%), 5/68 colour candidates
(7.35%), 211 application source files, 10 overall colour-candidate files/47 lines.
The five existing view colour exceptions remain. These are source-file measures,
not a measured percentage of 802 menu routes. New interactive controls use shared
primitives, semantic colours and the global sans font, with no new feature CSS.
Typecheck, focused lint, generated API/catalogue parity, production build, theme
write/check audit and git diff --check are required before final handoff.

HR menu after this phase: 54 Live, 2 In progress, 1 read-only and 19 prototype
pages (76 total). This is not an overall HR completion percentage. Safe next
non-Banking phase: Learning & Development — Training Programmes, Requests,
Sessions, Completion & Certificates — while retaining the documented Payroll
statutory/FX/dimension/correction limits and deferred Banking ownership boundary.


Final Performance handoff (2026-10-21): all 38 focused tests, final typecheck,
focused lint, production web build, generated API/catalogue checks, theme
write/check audit and git diff --check pass. HR80 is applied in both databases.
Normal real-login smoke verifies all four API/screen reads (200), anonymous
assessment read 401 and no-store, without inserting normal company records.
The API and web remain available on 4000 and 3000; the isolated API is stopped.

Local access activation is deliberately narrower than a general permission
rollout: only existing user-shoaib-super-admin, the sole active assignee of
policy-super-administrator in nexora-r06-uat, receives four Performance
permissions with company scopes for nexora-r06-uat-company. Its existing 54
Security administration permissions were verified read-only. No credentials,
other users/tenants, Banking rights or additional company scopes were changed.
The normalized and compatibility projections remain consistent. Automatic
approval rejected a proposed all-tenant grant; that migration was never installed
or executed. The explicitly scoped local alternative was separately approved,
applied and smoke-tested. Other company/tenant role assignments require their
normal Security administration process. Do not infer a completed multi-tenant
permission rollout from the isolated test bootstrap or the Live screen status.


## Performance completion and Employee Lifecycle phase — 21 October 2026

Performance now includes employee-owned self appraisals, invited named peer
feedback, sealed contribution versions in the manager review, independent
publication/calibration and employee acknowledgement. Non-HR employees have an
ownership-filtered inbox; company access and effective identity bindings are
rechecked before writes/replay. The model remains weighted five-point. Learning
enrolment and anonymous/configurable rating extensions are not implied.

Employee Lifecycle now has connected Onboarding, Probation Reviews, Movements,
Resignations, Termination Cases, Exit Clearance and Offboarding pages, alongside
the existing policy administration. Final Settlements remains In-progress:
exact manually reviewed statement approval works, while entitlement automation,
financial posting and payment integration remain outstanding. No payment/loan
recovery is fabricated. Existing Hire-only policies are preserved and block
unsupported transitions pending a governed upgrade. See hr-employee-lifecycle.md.

HR migrations 81–86 add tenant-isolated contribution/acknowledgement and Lifecycle
case evidence with immutable history, approval/source checks and active linked
account clearance controls. New policy drafts authorize confirmation and exits;
no existing approved policy is rewritten. Payroll eligibility preserves historical
employment after exit. No new role grants, Banking source changes or normal
company business records are created by verification. Learning & Development is
explicitly deferred until the end, per the user's updated sequence.

Validation: 31 focused HTTP/contract/Performance unit tests and 25 integration
tests across Performance, Lifecycle, Hire and Promotion pass, including ownership,
revocation, replay, concurrent decisions, exact money, legacy-policy rollback,
future exit dates, historical Payroll and real Security account clearance.
Chrome exercised appraisal submission/acknowledgement and all seven Lifecycle
approval/closure actions against the isolated database. Device checks cover both
themes at 1440/768/390/320; movement selectors were fixed after a detected phone
overflow. API/client generation, typecheck, focused lint, production build,
catalogue parity, theme audit and normal read-only smoke are recorded at handoff.

Theme audit source scope: 70 feature view TSX files, 0 font exceptions and 5 colour
candidates (7.14%); 213 application source files, 10 colour candidate files / 47
lines overall. These are source-file figures, not a percentage of menu screens.
New views use the global sans font, semantic tokens and shared controls.


Final local handoff: the normal database is HR86, API 4000 and web 3000.
Normal real-login verification passed twelve private reads (four Performance,
Performance inbox and seven Lifecycle sections), no-store headers and anonymous
401 checks, plus all eight connected Lifecycle routes. Ten new runtime table
privileges were verified. No normal business data was created or approved.
The final browser check passed all Lifecycle details/editors and both movement
tabs in light/dark at 1440/768/390/320 with no page errors or page overflow.
Absolute screen-reader labels in approval tables are now contained by their
existing scroll containers; table content remains horizontally scrollable.
Focused lint, typecheck, production build, API parity, catalogue parity, theme
write/check and git diff --check pass. Global source theme figures remain
0/70 font exceptions and 5/70 colour candidates (7.14%). Seven additional menu
pages are Live; Final Settlements is explicitly In-progress. Existing policy
configuration limitations and deferred financial posting/payment are unchanged.

## Governed employee policy upgrades - 21 October 2026

The legacy Hire-only policy blocker now has a connected, independently approved
upgrade workflow inside Lifecycle Policies. HR87 retains original Hire authority
and employment history while resolving an approved replacement for subsequent
confirmation and exits. It includes immutable decisions, effective-date and
state mapping checks, affected-case snapshots, concurrency/version checks,
current scope checks and safe replay. It does not replace the company default
for future Hires or automatically migrate normal employment records.

Validation: 13 focused HTTP unit tests and 18 integration tests pass (31 total),
including legacy confirmation-to-offboarding, stale evidence, concurrent
approvals, revocation, independent decisions and unchanged original history.
Chrome exercised request, approve, reject and cancel against isolated fixtures
and checked both themes at 1440/768/390/320. Typecheck, focused lint and the
production web build pass. Normal local rollout is HR87 with API 4000/web 3000;
read-only authenticated API/screen checks passed without normal business writes.

Theme audit: 71 feature views, zero font exceptions, five colour candidates
(7.04%); 214 app source files, ten colour candidate files / 47 lines. These are
source-file figures. Final Settlements remains In-progress with entitlement
automation, Finance posting and payment integration outstanding. Banking was
untouched and Learning & Development remains deferred until the end.

## Settlement calculation and Payroll/Finance handoff - 21 October 2026

Completed the non-Banking handoff for approved Final Settlements: reviewed
quantity/rate calculation with exact minor units, immutable source-to-adjustment
links, explicit exclusions, independent Payroll approval and actual Payroll
result/Finance journal progress. A reversed journal is distinguished from posting.
Rejected inputs can be replaced without losing their history; existing live or
consumed inputs cannot be duplicated. Company/month survive navigation into
Payroll inputs and Finance. HR88-89 contain the additive schema/approval guards.

Validation: 23 focused unit/HTTP tests plus 58 integration tests across settlement,
Lifecycle, policy upgrades, Payroll workspace and Payroll journals pass (81 total).
The production-classified synthetic isolated test carries the exact entitlement
through Payroll approval/consumption into a real Finance journal. Rates and
business records are artificial fixtures, not normal-company statutory authority.
Chrome verified calculation save, preparation and rejected-input replacement
in both themes at 1440/768/390/320, plus company/month navigation to both targets.
Typecheck, focused lint, production build, generated API parity, catalogue parity,
theme write/check and git diff --check pass at handoff. Normal local runtime is
HR89/API4000/web3000; verification uses read-only normal business access.

Theme source audit: 72 feature views, zero font exceptions, five colour candidates
(6.94%); 217 app source files, ten colour candidate files / 47 lines. Existing
colour exceptions are unchanged. This is a source-file audit, not a screen-count
completion percentage. The new UI uses shared controls and semantic tokens.

Final Settlements remains In-progress: automatic entitlement determination from
legal/service/leave policy and balance consumption remain future work. Banking
payment/reconciliation is deferred until the other developer's module is merged.
No Banking source changes, normal grants, settlement approvals or financial
postings were made by rollout. Learning & Development remains last. Resume with
governed entitlement policy/source integration, then Banking integration after
its owner's merge; preserve the completed Payroll/Finance path.

## Governed leave encashment and shared UI correction - 21 October 2026

Completed fixed company-rate paid-leave encashment in Final Settlements: independent
company-rule approval, effective dates, minimum service, capped unreserved ledger
days, protected source lines and atomic leave consumption on independent statement
approval. The existing Payroll/Finance path is preserved; a production-classified
synthetic isolated fixture verifies generated entitlement through actual posting.
No statutory rate is supplied or inferred from those artificial fixtures.

Shared backend helpers now own normalized company authority, leave balances and
settlement totals. Shared HR currency presentation uses exact arithmetic. The
shared Base UI Tabs orientation styles were corrected, with Employee History and
its phone selectors checked. Encashment screens use Tailwind/shared primitives and
semantic tokens, and leave screens explain settlement allocation separately from
leave usage and payment. Banking source was untouched.

Validation: 83 focused integration tests across encashment, Time & Leave,
Lifecycle, policy upgrades, settlement handoff, Payroll and Finance journals pass;
30 focused unit/HTTP tests pass (113 total). Chrome exercised rule creation,
independent approval/rejection, protected draft calculation and statement approval
with an actual leave-ledger deduction. Light/dark widths 1440/768/390/320 pass,
including existing Employee History tabs and the visible leave-ledger allocation.
Typecheck, focused lint, production build, API/catalogue parity, theme write/check
and git diff --check pass at handoff. Normal local database is HR93 with API4000
and web3000; normal verification is read-only with no new grants or business
approvals. Mutation/browser fixtures are confined to isolated PostgreSQL55433.

Theme audit source scope: 73 feature views, zero font exceptions, five existing
colour candidates (6.85%); 219 app source files, ten colour candidate files / 47
lines. These are source-file figures, not a percentage of completed ERP screens.

Final Settlements remains In-progress. Other benefit policies, salary-derived
rates, approved-encashment reversal and jurisdiction-specific entitlement rules
remain. Banking payment/reconciliation is deferred until the other developer's
merge; Learning & Development remains last. Resume with those named entitlement
gaps while preserving source protection, leave/Payroll locks and shared styling.

## Independent pre-Payroll statement correction - 21 October 2026

Current screen status: Lifecycle Policies, Onboarding, Probation Reviews,
Transfers/Promotions & Movements, Resignations, Termination Cases, Exit Clearance
and Offboarding Control Centre are Live (8 of 9 menu pages). Final Settlements is
In-progress. The 8/9 figure is approximately 89% by screen count, not an estimate
of total implementation effort or production readiness.

Open an approved Final Settlements statement and choose Request statement
correction. Record the contractual error and obtain a separate officer's review.
While review is pending, Payroll handoff and offboarding pause. Approve correction
and restore leave cancels the entire statement and adds exact positive ledger
entries matching every consumed encashment source. Original lines, amounts,
source editor, approval evidence and negative ledger entries are preserved.
Create a replacement draft for the same approved exit, calculate/review its
entitlements and obtain independent statement approval before offboarding.
Reject statement correction leaves the original statement approved; a later
request has its own independent reviewer. The latest 25 reviews are shown and all
decisions remain retained in the database/audit history. Amounts on a cancelled
statement are explicitly labelled as original audit values; its Payroll handoff
is disabled and explains the replacement step.

This workflow is restricted to active employment with an approved, uncompleted
exit, no statement Payroll links (including exclusions/rejected links), and no
calculated or finalized exit-month/later Payroll. It does not void an actual
Payroll/Finance obligation. Corrections after Payroll handoff, frozen Payroll or
completed offboarding remain separate work. A pending review can still be rejected
after Payroll freezes; restoration stays blocked. Attendance may already be
closed: only exact, provenance-guarded encashment restorations are permitted;
ordinary attendance/leave sources remain sealed.

HR94-95 add forced tenant RLS, immutable review terms/decisions, independent
decisions, append-only restoration provenance, duplicate protection and deferred
atomic commit checks. The shared leave reader now reports net allocated settlement
days and includes matching future restorations in historical availability. Current
normalized company permissions are checked before idempotency replay. Employees
cannot request/decide their own correction and the requester cannot decide it.
Lifecycle reason, CSRF, expected version, audit and idempotency controls remain.
No new endpoint or parallel calculation/balance authority was introduced.

Validation: 92 integration tests across eight connected Lifecycle, leave, Payroll
and Finance suites passed, plus 30 unit/HTTP tests. Chrome exercised request,
independent approval and rejection with actual exact leave effects. Both themes
and widths 1440/768/390/320 passed without page errors or root overflow. Typecheck,
focused lint, production web build, API/catalogue parity, theme write/check and
git diff --check passed. Shared Tailwind controls, global sans typography and
semantic colors are preserved; no feature CSS was added. Theme audit remains
73 feature view files, 0 font exceptions and 5 existing color candidates (6.85%);
these are source-file figures, not menu-screen completion percentages.

The Docker development services were found stopped on resume and restored using
their existing containers/volumes. Both local databases are HR95. Normal API4000
and web3000 run the current code; normal verification is read-only. Test/browser
mutations and demo-account provisioning were confined to isolated PostgreSQL55433.
No normal permission grants, employee approvals, Payroll posting or Banking
changes were made by this phase.

Remaining: gratuity/severance/notice and other settlement benefit policies,
salary-derived encashment bases, jurisdiction-specific entitlement rules and
corrections after Payroll handoff/finalization or completed offboarding. Banking
payment/reconciliation waits for its owner; Learning & Development remains last.
Next safe implementation batch is governed company benefit policies, retaining
explicit company configuration and independent approval rather than assuming
legal entitlements or default rates. Final Settlements stays In-progress.

## Governed company settlement benefits - 21 October 2026

Final Settlements now includes Company settlement benefits with Calculate benefit
and Benefit rules tabs. Create a company policy draft for gratuity, severance,
notice or another contractual benefit. Choose earning or deduction, an explicit
currency amount, fixed-amount or completed-service-year basis, capped whole-year
units, minimum service days, eligible exit types, bounded effective dates and a
signed company policy reference. A separate officer must approve or reject it.
Submitted terms are immutable. Only one approved rule per company/category may
cover a date, even when its exit-type scope differs; use non-overlapping policy
periods rather than ambiguous concurrent rules. No statutory/legal rate or
entitlement is supplied by this feature.

Open an approved exit's draft statement, select a rule and review service dates,
calendar days, completed anniversary years, capped units, rate and exact amount.
Fixed amounts use one unit. Partial years are not rounded up or prorated. Add or
refresh the generated category line; repeated calculation retains one current
line while preserving previous source snapshots. Separate categories may contain
earnings and recoveries with exact reconciled net totals. Review manual lines to
avoid counting the same obligation twice. Generated amounts, directions, rates and
source references cannot be edited or detached. Drafts may remove/refresh them.
Rule history retains currency precision even when a currency later becomes inactive.

Submission and independent statement approval recheck approved policy, current
employment, operational placement, exit scope/dates, currency and Payroll evidence.
Changed evidence requires draft refresh. Review is serialized against Payroll;
calculated/finalized Payroll requires its correction process. Source calculators
and the employee cannot approve the statement or derived Payroll inputs. Current
normalized authority is checked before idempotency replay. Statement approval does
not create leave entries, post Finance or pay the employee. The existing governed
Payroll handoff supplies actual input/result/journal progress. Whole-statement
correction before Payroll handoff also supports these benefit lines, preserving
original amounts and approvals without changing leave balances.

HR96 adds forced tenant RLS for company rules and immutable source evidence,
non-overlapping approved periods, independent decisions, exact category/source
guards and derived Payroll approval protection. Contracts, documented versioned
API, generated client, HR adapter and screen are updated together. Rules use the
existing Lifecycle policy permissions; no new normal grants or business approvals
were made. Banking code and payment/reconciliation remain with the other owner.

The new view uses shared controls/Tailwind, semantic colors and global sans
typography. Visual review found primary button foreground and inactive-tab browser
defaults conflicting with themes; these were fixed in the shared Button/Tabs
primitives. Both semantic token colors and existing Employee History tabs were
verified after theme/resize transitions. No feature CSS was introduced or removed.

Verification: 102 distinct focused integration cases passed across nine connected
Lifecycle/leave/Payroll/Finance suites (101 in the full run plus the added mixed
earning/deduction case in the ten-case benefit suite). The generated benefit was
consumed by actual Payroll and posted to a real Finance journal using artificial
production-classified statutory fixtures, which are not legal rates. All 34 focused
unit/HTTP cases passed (136 total). Chrome exercised rule creation, independent
approval/rejection, calculation/protected editor and independent statement approval;
fixed/service forms and all affected layouts passed light/dark at
1440/768/390/320 without page errors or root overflow. Shared Employee History's
three tabs passed the same themes/widths. Typecheck, focused lint, production web
build, API/catalogue parity, theme write/check and git diff --check passed.

Theme audit: 74 feature view source files, zero font exceptions and five existing
color candidates (6.76%); 220 app source files, ten color candidate files/47 lines.
These source-file counts are not screen-completion or ERP-readiness percentages.
Both local databases are HR96; normal API4000/web3000 run current code. Normal
verification is read-only. Mutations and browser records were confined to isolated
PostgreSQL55433. Browser fixtures use distinct names to fit the existing 100-company
picker; that directory remains bounded and unpaged, a separate shared-picker limit.

Lifecycle remains 8/9 menu screens Live; Final Settlements stays In-progress.
Remaining: salary-derived benefit/encashment bases, partial-year/company formula
policies, jurisdiction-specific entitlement rules and corrections after Payroll
handoff/finalization or completed offboarding. Banking payment/reconciliation waits
for its owner's merge. Learning & Development remains last. Next safe batch is
salary-derived settlement calculations with retained approved salary authority,
explicit divisors/bases and independent policy approval; preserve exact money,
source protection and shared theme controls.

## Approved-salary company benefit basis - 21 October 2026

In Final Settlements > Company settlement benefits > Benefit rules, choose
Approved monthly salary components as the rate source. Select active fixed earning
components and enter an explicit integer multiplier and divisor from the signed
company policy. No divisor, statutory percentage or legal benefit amount is
assumed. The existing quantity basis supports a single award or capped completed
calendar service years. Fixed company currency rules remain compatible.

Calculation resolves exactly one independently approved, governed fixed monthly
salary covering the approved exit date, in the rule currency. It uses the salary
assignment's captured component amounts. Formula, hourly, daily, weekly, annual,
custom and non-governed legacy salary conversions are not inferred. Missing or
inactive components, fractional currency amounts beyond supported precision,
submitted salary changes and unsupported/oversized amounts block generation.
The preview shows salary ID/version/effective dates, component amounts, exact
basis and policy factors. A rounded reference rate is labelled as display only;
the final amount is calculated from the exact basis and rounded half up once.
For example, a synthetic 3,100,000-minor-unit basis × 2 units ÷ 3 is 2,066,667
minor units, rather than multiplying a previously rounded unit rate.

Salary setup/read authority is required to calculate, submit/approve, view retained
salary-source statement evidence or prepare its Payroll handoff. Normalized current
company grants are rechecked before replay. Rule configuration/decisions require
Payroll setup read in addition to the existing Lifecycle policy permissions.
Rules show their included component scope; generated lines retain the exact
factor, approved salary reference, component names and immutable source snapshot.
The shared settlement calculator/contract now supports bounded rational factors
with integer arithmetic; existing two-argument fixed/leave calculations preserve
their behavior. Read-only generated editors and statement details show factors.

Source capture and independent statement approval share a database salary-proof
function, with forced tenant scope and Payroll serialization. Draft statements must
refresh after an approved salary revision. Once a salary-based statement is
approved, salary changes affecting its reviewed source cannot be submitted or
approved until that statement is independently corrected. Payroll surfaces this
as a specific correction instruction. The existing pre-handoff statement correction
cancels it without changing leave and retains its original salary evidence. Salary
evidence is checked again before Payroll handoff; no stale source is silently
substituted. Actual input approval, Payroll consumption and Finance posting remain
separate, with calculator/employee exclusion and immutable provenance preserved.

HR97-98 add salary proof and correction guards plus explicit Payroll guidance.
No normal permission grants, salary changes, employee decisions, Payroll postings
or Banking changes were made by rollout. Both databases are HR98, normal API4000
and web3000 serve current code, and normal verification is read-only. Test/browser
mutations are restricted to isolated PostgreSQL55433.

Validation: 109 integration tests across ten connected salary-benefit, company
benefit, correction, encashment, Lifecycle, policy, leave, Payroll and Finance
suites passed. This includes actual generated salary-benefit consumption and
Finance posting using artificial production-classified statutory fixtures; those
fixtures are not legal rates. All 37 focused unit/HTTP tests passed (146 total).
Browser tests covered salary-rule creation, independent approval/rejection,
source calculation/protected editor and independent statement approval. Single
award and service-year forms, salary evidence and affected layouts passed both
themes at 1440/768/390/320 with no page errors or root overflow. Typecheck, focused
lint, production web build, API/catalogue parity, theme write/check and
git diff --check passed. Runtime salary-proof privileges and forced tenant RLS
were verified. Normal authenticated reads returned 200/no-store, anonymous reads
401, with eight connected Lifecycle routes checked without business writes.

All UI additions use shared Tailwind controls, global sans typography and semantic
theme tokens. No feature stylesheet or extra palette was added. Audit remains
74 feature view source files, zero font exceptions and five existing color
candidates (6.76%); 220 app source files, ten color candidate files/47 lines.
These are source-file figures, not completed-screen percentages.

Lifecycle remains 8/9 menu pages Live. Final Settlements remains In-progress for
salary-based leave encashment, partial-year/company formula policies, jurisdiction-
specific entitlement rules and corrections after Payroll handoff/finalization or
completed offboarding. Banking payment/reconciliation waits for its owner and
Learning & Development remains last. Next safe batch is salary-derived paid-leave
encashment using the same salary authority, explicit company divisors/factors,
single-rounding arithmetic and existing immutable leave-consumption/reversal path.

## Salary-based paid-leave encashment - 21 October 2026

Completed this batch: Final Settlements > Leave encashment > Company rules now
supports Approved monthly salary components as its rate source. Select the fixed
earning components and explicitly enter the multiplier and divisor from the signed
company policy. Fixed currency daily rules remain supported. No statutory divisor,
rate or eligibility is assumed. Independently approve the company rule before use.

Calculate leave shows the posted balance, protected pending/future days, capped
eligible days, approved salary ID/version/effective dates, captured component
amounts and exact formula. The reference daily rate is rounded for display only.
The final total uses exact minor-unit integer arithmetic and rounds half up once.
For example, the synthetic company policy basis 3,100,000 minor units / 30 x
10.2500 days yields 1,059,167 minor units. Multiplying a previously rounded daily
rate would produce an incorrect amount. Four-decimal days are retained exactly.

The same shared salary authority used by company benefits resolves exactly one
governed, independently approved fixed monthly salary covering the exit date.
Captured components must be active fixed earnings in the rule currency. Missing
components, unsupported rates/currency precision, formula conversions, submitted
salary changes and unsupported totals block generation. Salary read plus setup
read is checked for preview, retained statement evidence, statement decisions,
Payroll handoff and idempotent replay. Policy rule configuration and decisions
also require current company Payroll setup read. Permission grants are unchanged.

Immutable source lines retain salary/component evidence and explicit factors.
Drafts must refresh after salary changes. Independent statement approval consumes
the exact days atomically; source calculators and the employee cannot approve
derived obligations. Approved salary-based settlements require independent
correction before a salary revision covering the source can submit or approve.
Pre-handoff correction cancels the statement and restores the exact encashed days
through the existing positive reversal ledger, preserving original evidence.
Payroll handoff checks salary freshness again; actual adjustment approval,
consumption and Finance posting retain separate approvals and immutable links.
No payment or Banking completion is implied.

HR99 adds salary-aware rule/source/statement approval and salary-change guards,
reusing the database salary proof function. Both local databases are HR99. Normal
API4000 and web3000 serve the connected implementation. Normal verification made
no business writes; rule/statement/Payroll/Finance test mutations used isolated
PostgreSQL55433. Banking files were not changed by this batch.

Validation: 116 integration tests across eleven connected suites plus 39 focused
unit/HTTP checks passed (155 total). Checks cover exact fractional-day rounding,
current salary permissions and replay, stale source refresh, protected lines and
database evidence, independent approval, exact correction restoration, salary
change blocking and actual Payroll consumption through Finance posting. Synthetic
production-classified Payroll fixtures do not establish legal rates. Chrome
exercised rule creation, independent approval/rejection, salary calculation,
protected statement editor and statement approval. Affected forms and evidence
passed light/dark at 1440/768/390/320 with no page errors or root overflow; captured
desktop/mobile views were inspected. Typecheck, focused lint, production web build,
API/catalogue parity, theme write/check and git diff --check passed. Normal
authenticated reads returned 200/no-store, guests 401, and eight connected
Lifecycle routes passed without normal business writes. Runtime salary-proof
execution privileges and forced tenant RLS on encashment tables were verified.

Salary factors, component selection and evidence now use shared HR components
across company benefits and leave encashment. All affected UI uses Tailwind,
semantic global theme colors and the global sans font; no feature CSS was added.
Audit: 74 feature view source files, zero font exceptions, five existing color
candidates (6.76%); 221 app source files and ten color candidate files/47 lines.
These source-file figures do not measure completed menu screens. The existing
bounded company picker remains a separate limitation for very large company lists.

Lifecycle remains 8/9 menu pages Live. Final Settlements remains In-progress for
partial-year/company formula policies, jurisdiction-specific entitlement rules and
correction after Payroll handoff/finalization or completed offboarding. The next
batch is explicit company benefit formula/partial-year policy support, with the
company's approved calculation basis. Banking awaits its owner; Learning &
Development remains last. Salary-based leave encashment is complete for the
supported approved fixed monthly salary basis described above.

## Service-day company formulas and rejected-input correction - 21 October 2026

Company benefits now support a single award, capped completed calendar years or
capped actual service days. Service-day policy requires an explicit elapsed
(exit minus employment start) or inclusive (both endpoints) convention. The
approved company multiplier/divisor converts a fixed company reference amount or
captured approved monthly salary basis into the final entitlement. A company can
therefore express a partial-year policy using its explicitly approved year-day
divisor, without rounding years or daily amounts before the final calculation.
Fixed reference factors are also available for awards/years. Mixed salary and
fixed rate factors, ambiguous day counting and out-of-range caps are rejected.
Day caps are bounded to 36,500; award/year caps retain their existing bounds.
No statutory divisor, eligibility or legal entitlement is inferred.

Preview shows actual service dates/days, quantity convention, capped units and
salary/component evidence where applicable. Immutable lines retain exact factors
and sources. Rule creation/independent decisions, normalized current company
authority, version/idempotency checks, salary privacy and stale-source detection
remain enforced. Existing fixed and completed-year snapshots remain compatible.
HR100 extends rule/source guards and unit bounds additively.

Statement correction can now proceed after a Payroll handoff only when every
generated input is independently rejected and Payroll remains open. Draft inputs
must first be submitted and rejected in Payroll by a separate reviewer. Zero-value
exclusions may remain; nonzero exclusions representing externally processed
amounts continue to block restoration. Source links, rejected inputs, original
statement and calculation history are never deleted. Existing separate correction
approval cancels the statement and restores its exact encashed days atomically.
Active/consumed inputs, calculated/finalized Payroll and completed offboarding
remain protected. HR101-102 add rejected-input support and nonzero-exclusion
protection; the same checks run in the API and database.

Validation: 122 distinct integration checks across thirteen connected suites and
39 focused unit/HTTP checks passed (161 total). The broad run had one legacy
eligibility wording mismatch; restoring the old completed-year message resolved
it and all ten company-benefit checks passed on rerun. The other twelve suites
passed the broad run. Checks include salary and fixed-reference partial years,
elapsed/inclusive counting, caps, exact single rounding, rule/source forgery,
Payroll rejection before statement correction, preserved immutable links, exact
leave restoration and refusal of nonzero external references through API and DB.
Chrome exercised fixed-reference and salary partial-year forms plus source
calculation in light/dark at 1440/768/390/320. Captures were visually inspected;
no page errors or root overflow occurred. Required production build, typecheck,
focused lint, generated client/API and catalogue parity, theme write/check and
git diff --check passed. Normal verification is read-only and includes salary
source controls, authenticated no-store responses, anonymous rejection and eight
connected Lifecycle routes. Both local databases are HR102; API4000/web3000 are
running. All financial test mutations used isolated PostgreSQL55433.

Affected controls continue using Tailwind and shared semantic themes/global sans
font. The shared rate-factor fields now support explicit policy or salary labels;
the new factor toggle has a unique associated accessible label. No feature CSS or
palette was added. Audit remains 74 view source files with zero font exceptions,
five existing color candidates (6.76%); 221 app source files, ten color candidate
files/47 lines. These figures are source audits, not completed-screen percentages.
Banking's pre-existing changes were preserved; no Banking work was included.

Remaining scope: Final Settlements remains In-progress, with Lifecycle still
8/9 menu pages Live. A governed post-finalization/paid-Payroll adjustment and
post-offboarding correction workflow is not implemented by this batch. These
require compensating financial records and statutory reassessment, rather than
editing finalized results or restoring leave against an active obligation.
Country/jurisdiction and approved company statutory/partial-year policies were
requested from the user; actual statutory rates/eligibility must not be invented.
The configurable service-day formula capability is complete, but no company
policy has been installed automatically. Banking remains deferred to its owner,
and Learning & Development remains last.

## Administrator-configured country settlement policies - 21 October 2026

Delivered country-specific policy configuration for both Company settlement
benefits and Leave encashment. Admins with current company Lifecycle Policy
manage permission can create country or regional rules using the existing fixed
amount, approved monthly salary component, award, service-year or service-day
calculation controls applicable to that calculator. Creation remains a draft;
the author submits it and a separate authorized policy officer approves/rejects.
No new normal permission grants or statutory rates were installed.

To configure: open Final Settlements, then Company settlement benefits > Benefit
rules or Leave encashment > Company rules. Create a rule and complete Country
applicability: choose a country from the shared catalogue, an explicit Legal
employer or Employee work location basis, whole-country/regional coverage and
the reviewed authority/document reference. Complete the signed company policy
reference, rates/factors, service limits and dates before independent approval.
Country references come from the central Platform catalogue; approved effective
employer/location profiles use the existing Payroll localization workflow. New
country reference releases remain centrally governed. Rule creation is generic
for registered countries; no country-specific rates are embedded in HR code.

An effective approved legal-employer or employee work-location profile determines
applicability at the approved exit date. Citizenship/nationality is not used as a
jurisdiction substitute. References and ancestry must be active and cover the
rule/date range. Work-location rules require the real operational assignment;
missing/ambiguous profiles, inactive/cyclic ancestry, required missing regions
or unresolved approved employee jurisdiction overrides block calculation.

Policy priority is regional ancestry, then whole country, then company default.
A default cannot bypass a matching, more specific approved rule. The preview
shows the applicable policy and provides Use applicable rule when another rule
is selected. Same-scope approved periods cannot overlap. Country policies for one
company benefit category or leave type must use one consistent profile basis
over overlapping dates; cross-border assumptions are not silently resolved.
Independent country/regional scopes can coexist in the same effective period.

Country context, selected/eligible policy set, approved profile and jurisdiction
ancestry are retained in the immutable calculation source. Preview, independent
statement approval and Payroll handoff use one shared tenant-scoped resolver and
database proof. Changed evidence requires refresh/correction. Statement review
and retained history expose the original captured date, country, hierarchy,
policy, authority reference and profile ID without reading live replacements.
Salary evidence still requires current salary read authority. Retained evidence
uses the existing source-authority read with compact projections, avoiding extra
per-case queries or transferring unrelated policy/salary snapshots.

Once generated inputs are active or consumed in Payroll, a policy cannot be
backdated over that statement's generated benefit/leave obligations. Use a
future effective period, or independently reject unprocessed inputs and correct
the statement first. Nonzero external processing references also preserve this
boundary. Actual finalized/paid obligations require governed compensating
financial corrections. Future policy approval preserves posted Payroll/Finance
history. Rule approval and handoff share company serialization so a concurrent
handoff cannot evade this check.

HR103-106 add scoped exclusion keys, active reference validation, bounded
hierarchy/rule resolution, immutable source/approval/handoff proof and Payroll
obligation protection. Existing fixed rules and sources retain their original
terms and fingerprints when no country policy applies. Forced tenant RLS remains
on all benefit/encashment rule and source tables. New proof functions execute as
the caller, and runtime execution/table privileges were verified without grants.
Both local databases are HR106; API4000 and web3000 serve the implementation.
Normal verification is read-only; all rule/statement/Payroll/Finance acceptance
mutations used isolated PostgreSQL55433. Banking was not modified by this work.

Verification: 141 distinct integration checks across sixteen connected country,
localization, settlement, salary, leave, Payroll and Finance suites plus 39 focused
unit/HTTP checks passed (180 total). The initial broad run passed 140 checks;
focused reruns cover the additional backdating case, retained proof projection,
salary privacy and subsequent obligation guard. A test-only future-date alias was
corrected and its actual Payroll/Finance case passed on rerun. Coverage includes
separate country scopes, regional priority, country mismatch, missing evidence,
invalid/conflicting references, source forgery, stale review/handoff, exact leave
consumption/restoration, real Finance posting, rejected-input recovery and future
policy approval without changing posted obligations. Synthetic acceptance rates
and regions do not establish legal entitlements.

Chrome exercised benefit and encashment country-rule creation, independent policy
approval, calculations and captured statement evidence in light/dark at
1440/768/390/320. Created scope terms were read back from the API. Country lookup
preserves entered rates/components/dates and active tabs; resetting country scope
clears its jurisdiction controls. Captures were visually inspected with no page
errors or root overflow. Production build, typecheck, focused lint, generated
client/API and catalogue parity, theme write/check and git diff --check passed.
Normal authenticated endpoints return 200/no-store, anonymous requests 401; both
country forms and eight connected Lifecycle routes passed without business writes.

UI additions use shared Tailwind controls and global semantic colors/sans font.
No feature CSS or palette was added. Theme audit: 74 feature view files, zero font
exceptions, five existing color candidates (6.76%); 222 app source files and ten
color candidate files/47 lines. These are source-file figures, not completed-menu
percentages. Country choices are bounded to 250 and per-country jurisdiction
options to 500, ordered national/subnational before local. The resolver bounds
policy cohorts to 500 and ancestry to 32 entries.

Country-specific configuration support is complete for these supported formulas
and applicability bases. Actual authority references, rates and eligibility must
be entered and independently approved for the company. Final Settlements remains
In-progress solely for the previously identified finalized/paid Payroll and
post-offboarding correction workflows; this batch does not implement them.
Lifecycle remains 8/9 menu pages Live. Banking remains deferred to its owner;
Learning & Development remains last.


### 2026-10-21 — Financial correction review after Payroll or offboarding

Completed the **review stage** of compensating final-settlement corrections. In
Final Settlements, open an approved statement whose exit Payroll has been
calculated/finalized, whose inputs were consumed, or whose employment has actually
ended. Authorized officers can propose full corrected amounts for every retained
line and attach a supporting authority/reference. The server derives each signed
difference and the net difference using exact integer minor units. Deductions
reduce the net difference; a negative difference is presented for recovery review.
Unchanged lines are retained, and a wholly unchanged proposal is rejected.

A different authorized officer approves or rejects the review. Approval is
explicitly **awaiting separate Payroll correction**: it does not recalculate tax,
post Finance, create a Payroll adjustment, pay money, restore leave, reactivate
employment or rewrite the original approved statement. This is a review of
proposed differences and supporting evidence, not an alternate benefit-policy
calculator or permission to bypass the retained approved source formulas.

HR107–108 add a forced tenant-RLS review ledger and source-context reader. The
snapshot retains the original statement/evidence and actual employment, Payroll
input/result/run and Finance journal states. Evidence changes prevent approval;
the reviewer can reject and request a fresh proposal. SQL guards independently
verify the original line amounts and exact differences, prevent source/request
tampering and affected-employee decisions, and preserve decisions. Company locks
and a partial unique index permit one unresolved review per original statement;
an approved review remains unresolved financially and cannot be stacked. Existing
statement handoff and exit-state mutations cannot bypass an unresolved correction.

The existing versioned Lifecycle API gains request_financial_correction and
decide_financial_correction actions, plus financial_corrections in statement
responses. Current normalized company and Payroll setup/input/result read grants,
Lifecycle action/approval and salary-source privacy are checked before idempotent
replay. Browser mutations retain CSRF/origin enforcement. Approval/rejection and
their complete original/proposed evidence are recorded in the review ledger and
the standard audit boundary; rejected requests remain visible.

Verification: 44 distinct database integration checks across seven suites and 39
focused unit/API checks passed (83 total). These include actual authoritative
offboarding, a consumed salary-derived settlement through actual Payroll and
Finance posting, stale decisions after posting, revoked-grant replay, duplicate
requests, direct SQL source/difference tampering, immutable history and unchanged
original obligations. Five new review checks passed after the isolated fixture
was corrected to use a unique subject account. Acceptance data is synthetic and
does not establish any statutory rate. Banking/paid-payment execution was not
tested or changed.

Chrome completed proposal, independent approval and rejection, with light/dark
checks at 1440/768/390/320, no page errors or root/section horizontal overflow,
and the global sans font. Proposal, decision and saved-state captures were
visually inspected. The screen uses existing Tailwind/shadcn controls and semantic
tokens, with no feature CSS or font override. Production web build, typecheck,
focused lint, API generation/parity, catalogue parity, theme audit and diff check
passed. Theme audit: 74 feature view files, zero direct font exceptions, five
existing colour candidates (6.76%); 223 app source files, ten colour-candidate
files/47 lines. These are source-file figures, not completed-screen percentages.

Both local databases are HR108. The normal API is restarted on port 4000, with
the web on 3000. Normal Final Settlements/Offboarding authenticated reads return
200/no-store and anonymous reads 401; current response contracts and the page
were checked without business writes. Runtime table/function privileges and
forced tenant RLS were verified without changing grants.

**Next required phase:** execute an approved correction through a supplemental
Payroll/statutory calculation and independently governed Finance adjustment,
including negative recovery handling, payment reconciliation after Banking is
merged, and any separately authorized leave correction. No Payroll reopening or
financial reversal is implied by a review approval. Final Settlements therefore
remains In-progress; Lifecycle is still **8/9 menu pages Live**. Banking remains
with its existing owner; Learning & Development remains last.


### 2026-10-21 — Lifecycle completion and company/session recovery (HR116)

Employee Lifecycle now has **9/9 API-backed menu screens marked Live** within the
agreed non-Banking scope. Final Settlements is no longer a prototype or a
review-only correction screen. Banking payment reconciliation, actual collection
of paid recoveries and external obligations without governed Payroll provenance
remain separate dependencies; no payment is invented or confirmed by this work.

The blank company list was reproduced: a valid fresh login returned both
authorized companies, while an expired cookie left cached workspace state visible.
The shared generated API client now notifies the session boundary on protected
401 responses. The workspace returns to sign-in; stale requests cannot clear a
newer successful login, and identity changes remount feature caches. Login errors,
403 permissions and infrastructure failures retain their own behavior. Policy,
case and movement selectors provide readable loading/empty/error states and retry.
All nine normal Lifecycle routes loaded their company lists after rollout.

HR109–116 deliver an immutable supplemental Payroll execution ledger linked to
independently reviewed settlement corrections. Officers review taxable treatment
and a Finance posting date, calculate with the original sealed production tax
rules/declarations, independently approve, and post only balanced account
differences through the actual Finance service. Later finalized employee months
are recalculated from their retained YTD provenance. Posted overlays feed future
ordinary Payroll YTD reads and invalidate later calculated/unreviewed runs that
need recalculation. Payroll runs show original and supplemented totals separately;
the Finance/Payroll dashboard includes posted supplements. Original results,
consumed inputs, salary/loan evidence, journals and published payslips are retained.

Repeated corrections use the last processed amounts as their baseline. Approved
reviews become processed only with their actual posted execution. Version/hash
checks, company locks, current normalized permission checks before replay,
independent reviewers/posters, source-author/calculator exclusions, beneficiary
exclusions and audit history apply throughout. The original approver is correctly
distinguished from a draft editor. Finance-only reversal is blocked because it
would leave Payroll tax carry-forwards unchanged; use a compensating correction.

Encashment corrections retain four-decimal days, exact source rates/factors,
half-up rounding and the approved cap. They check actual available/reserved leave.
Independent Finance posting and signed leave correction entries commit atomically;
rejection or failure changes neither money nor leave. Successor corrections may
restore or consume the reviewed difference without rewriting original consumption.
Country-proof comparison accepts only administrative placement closure backed by
the actual employment exit event; changed placement/jurisdiction evidence remains
blocked. Ended employment is never reactivated by financial correction.

Verification: **134 distinct integration checks across 16 suites plus 125
unit/API checks across 11 suites passed (259 checks)**. The five supplement
integration scenarios were rerun after the author/approver distinction was fixed.
Coverage includes repeated monetary and leave corrections, real offboarding,
retained country applicability, source tampering, revoked-permission replay,
stale rates, protected history, closed Finance rollback, YTD arithmetic and
connected summary totals. Acceptance rates/data are synthetic, not legal rules.
Chrome completed calculation, independent approval, actual Finance posting,
day-based proposal and actual Finance/leave posting. Light/dark checks at
1440/768/390/320 showed no page errors or root/section horizontal overflow and
used the global font. Captures were visually inspected.

Production build, typecheck, focused lint, API generation/parity, catalogue
generation/parity, theme audit and diff checks passed. Shared alerts and the
session banner use semantic theme tokens; affected Finance legacy presentation
was moved to Tailwind/shared controls. No feature CSS was added. Theme audit:
74 feature view files, zero direct font exceptions, five existing colour
candidates (6.76%); 224 app source files, nine colour-candidate files/46 lines.
These figures measure source files, not completed menu percentages.

Both local databases are HR116. Normal rollout changed only HR migrations;
runtime privileges and forced tenant RLS were verified without ad-hoc grants.
The normal web/API remain on 3000/4000. Eleven normal authenticated reads returned
200/no-store and anonymous reads 401, without business writes. All nine company
selectors, expired-session recovery and transient-failure retry passed normally.
The temporary test API is stopped. Banking implementation was untouched;
Learning & Development remains last as previously requested.

Operational limits are explicit: original changed obligations must have real
consumed Payroll provenance, and affected original accruals must be posted before
their supplement. Excluded/unproven external amounts cannot become fabricated
Payroll inputs. Paid/closed negative recoveries wait for Banking provenance and
receivable classification. Current Finance periods/rates/accounts must permit
posting; source changes require rejection/recalculation. Synchronous execution is
bounded to 120 affected finalized employee months and 600 earlier history rows.


## 2026-10-21 — Benefits & Self-service connected phase

The four Benefits & Self-service menu routes now render API-backed workspaces:

- Loans, Benefits & Gratuity reuses the existing governed loan and repayment schedule workflow and the same independently approved company/country benefit rules used by Final Settlements. Standalone rule maintenance opens on Benefit rules; employee calculations remain attached to actual approved exits and retained salary evidence.
- Statutory Deductions reuses the governed legal-employer, work-jurisdiction, declaration, contribution-base, pack publication and activation workflow. No duplicate rates, invented legislation or separate deduction calculation is introduced.
- Employee Self-service uses a new employee-owned API boundary. Active account, effective Security employee binding, explicit current company access and actual employment relationship are checked on each read. Caller-selected employee IDs are rejected, including for administrators. Only immutable, hash-verified published payslips can be opened/downloaded; employer-wide Payroll permissions are not required. Current exact leave balances, overlapping monthly requests, approved loans and published monthly pay use the existing source ledgers. Pagination, empty/error/unbound states and refresh are supported.
- HR & Payroll Report Centre exposes live workforce and Payroll overviews and permission-filtered links to the owning detailed operational workspaces. It does not expose the prototype report catalogue or fake export buttons. The separate Compliance/Secure Export section remains the next delivery.

Delivery bounds: self-service is a personal viewing/download workspace in this phase. Employee-initiated leave submission and personal-data changes still use the existing HR process; the screen states this explicitly. Secure bulk report exports and wider compliance reports are not represented as delivered. Banking integrations remain with the other developer; Learning & Development remains deferred. No Banking or Finance posting files were changed in this phase. No new database migration was required (existing HR116 sources reused).

Validation: 36 integration checks across self-service (7), loans, localization setup and benefits; 12 HTTP/session unit checks; focused lint; full typecheck; generated API/catalogue parity; global theme audit; production build. Chrome verified all four routes, actual published payslip Open/Download and light/dark layouts at 1440, 768, 390 and 320 pixels. No route/root horizontal overflow or JavaScript errors. Shared workforce and Finance company selectors were corrected for narrow widths. Global font tokens are inherited; no feature stylesheet, literal palette or page-specific font was added.


## 2026-10-21 - Employee leave self-service

Employees can now review their own effective shift calendar, policy and exact available balance; select full or half days; save an immutable draft; submit it to the existing reporting-manager/HR queue; and cancel their own draft or pending request. The personal screen opens request detail, displays allowed actions and decision history, refreshes its company/month records after mutations, and explains why approved leave must be cancelled by an independent HR officer.

The four new /api/v1/hr/self_service leave endpoints reuse TimeLeave and AttendanceCompletion instead of adding a parallel request or ledger. Contracts, OpenAPI and generated clients are updated together. Employee IDs, HR approval actions and self-approval overrides are rejected on the personal boundary. Server-side authority checks require the same active user, effective employee binding, current company access and approved employment. Writes check ownership inside the transaction before idempotent replay, lock the current binding/account/access rows, reject impersonated writes, and use existing Attendance serialization, evidence hashes, expected versions, immutable audit and idempotency records. No HR permission is injected into the employee actor.

Only the owned employee appears in personal calendar options. Same-company requests belonging to other employees return 404. Active employment eligibility is explicit in the personal workspace response; historical or impersonated sessions cannot be shown actionable personal controls. Ended/archived reporting-manager account bindings are excluded from routing. Existing manager/HR decisions remain independent, post actual daily leave usage atomically, and use the same employee/company records as Attendance and Payroll. Pending cancellation releases reservations; approved leave does not gain a personal reversal path.

Verified-document policies remain enforced. Where a document is required, the personal form explains the requirement and directs the employee to the existing HR verification workflow. Employees cannot attach arbitrary document IDs or self-verify evidence. Personal-data corrections and governed bulk compliance exports remain next work. Banking and Finance posting files were not modified; Learning & Development remains deferred. Existing HR116 tables, triggers and runtime privileges were sufficient; no applied migration was changed.

Validation: 32 integration checks across personal leave (9), existing Time & Leave (16) and the personal portal (7); 22 HTTP/session unit checks; full typecheck, focused lint, generated API/catalogue parity, theme audit and production build. Browser acceptance used a newly provisioned isolated employee with no HR permissions: actual full-day draft, submission, pending cancellation, exact restoration to 10.0000 days, half-day draft and denied employer-wide read. Light/dark at 1440/768/390/320 had no root/section horizontal overflow, JavaScript errors or font overrides. New UI uses shared Tailwind/shadcn controls and semantic global tokens. Normal-company checks remain read-only.


### Normal environment verification - 2026-10-21

The pending normal API restart is complete. Web remains on port 3000 and the updated API serves port 4000. Read-only Chrome checks against the normal environment verified the personal portal returns 200 with no-store and explicit leave eligibility, unauthorized company calendar access returns 403, anonymous personal leave endpoints return 401, and the screen renders without JavaScript errors. The unbound administrator sees the employee-account linking guidance; no other employee is selected through administrator authority. No normal business records were created or modified. The isolated API used for acceptance testing was stopped after verification.


## Personal-data corrections and governed reporting — 2026-10-21

This checkpoint supersedes earlier notes listing these workflows as future work.

- Employee Self-service gains Personal details: seven allowed name, birth-date and personal-contact fields, current recorded values, reviewed proposals, submission/cancellation, paginated history and visible decision reasons. Work email/login, assignments, employee number, tax identifiers and Banking remain separate governed workflows. No employer-wide permission is injected into the employee session.
- Employee Approvals gains an independent Personal data corrections review tab. HR compares original/proposed values and records supporting verification references and a versioned decision. Approval requires current company access, current normalized role grants, active approved employment and unchanged profile/contact/version evidence. A requester or affected employee cannot approve their own correction. Approval atomically closes/replaces personal contacts, updates the canonical profile and appends its immutable version. Closing an obsolete personal contact also clears its canonical projection through the shared contact trigger. Stale requests must be rejected and resubmitted rather than overwriting concurrent changes.
- Compliance Configuration authors bounded disclosure policies (1–5,000 rows, 1–168 hours and explicit supported reports). A different authorized officer approves/rejects each immutable proposal. Statutory rates and country packs remain in the existing Payroll configuration; this screen adds no invented legal rules.
- Secure Export Centre supports employee-directory and finalized Payroll-result reports. Payroll totals come from current finalized Finance-posted runs and the existing effective settlement-correction projection. Personal email/phone, birth dates, bank details and tax identifiers are excluded. Additional report types are not implied by these three Live menu entries.
- Export creation retains authorization metadata, source hash and row count. A POST download rechecks current company/role/report authority, requester ownership, approved policy, expiry and unchanged source, including idempotent retries. CSV is regenerated in memory and returned without server file storage or report rows/bytes in receipts, audit payloads or idempotency records. Exports are capped at 2 MB and 20 receipts per actor/company/hour; date ranges and pagination are bounded. Formula-like CSV cells are neutralized and quoted. A changed policy/source or expired authorization requires a fresh receipt.
- Report Audit Log lists actual policy decisions, receipt creation and authorized downloads. Denials stay in API/security logs. No artificial audit events or report data are shown. The Report Centre links to these screens subject to current permissions.
- Shared HrCompanyScope centralizes retry/loading/error/empty/company behavior for the touched Benefits and reporting screens. New screens use Tailwind and shared shadcn controls, semantic colors and the global sans font; no feature CSS or local font/palette was added. Existing directory picker retains its 100-company bound; larger tenant directories need a separate pagination enhancement.

API: five new versioned personal_corrections/report_governance endpoints, shared strict contracts, OpenAPI and generated clients. Commands require session/CSRF/trusted origin, current authority before idempotent replay, independent decisions, serialization, expected versions and immutable platform audit. HR117–120 are additive migrations; no applied migration was modified. HR120 backfills only active existing super-administrator policies with the six exact reporting permissions and matching normalized scope/compatibility projections under each tenant context. Tenant-registry FORCE RLS is restored in the same migration transaction before commit; normal API runtime remains non-superuser/non-BYPASSRLS, with all four new tables forced to tenant RLS. Other roles require explicit grants through the existing Security workflow.

Verification: 58 distinct integration checks across governance (26), employee-owned leave (9), Time & Leave (16) and personal portal (7); 41 HTTP/session checks across governance (19), personal leave, portal and session expiry. The finalized Payroll fixture posts through the existing Finance workflow and its actual CSV totals are checked against canonical result records. Contact removal, stale-source decisions, idempotent retries, unauthorized-company replay, expiry, policy replacement, immutable history and CSV injection are covered. Full typecheck, production Next build, generated API/catalogue parity, focused lint for new services/views/tests, theme audit and git diff whitespace checks passed. The existing large source-repository/client files still have unrelated baseline lint findings; newly introduced unused imports were removed.

Isolated Chrome acceptance: a fresh employee without HR permissions submits a real name/phone correction; a separate officer approves it in the HR review screen; the employee sees the applied result. The officer approves a different maker's disclosure policy, creates an actual directory receipt, downloads CSV and sees the access event. Five routes and form/pending/review/export states were checked in light/dark at 1440/768/390/320: no root/section horizontal overflow, font overrides or JavaScript errors. Mobile screenshots were visually reviewed. Artifacts: D:/Xyric Work/ERP_Nexora/tmp/recovered-hr-work/hr-governance-phase/browser-result.json and matching PNGs. Theme audit: 0/78 direct feature-view font exceptions; 5/78 existing direct color-exception files (6.41%), none introduced by this phase. These are source-file percentages, not ERP menu-screen coverage.

Normal rollout: preflight confirmed only intended HR migrations pending; normal and isolated schemas are HR120. API restarted on port 4000; web remains port 3000. Read-only normal Chrome checks verified company-backed correction review and all three reporting sections return 200/no-store, unassigned company returns 403, anonymous endpoints return 401 and four UI routes render without JavaScript errors. No normal employee, policy or export business records were created during acceptance. Temporary isolated API is stopped after checks. Existing Banking and Finance posting diffs remain unchanged at 64/42 and 17/7 lines respectively.

Safe resume: extend the report catalogue only through owning API/domain permissions and retained source evidence. Banking payout/settlement linkage awaits the other developer's module. Learning & Development remains deferred at the user's request. Do not mark remaining prototype screens complete solely because their shell is reachable.


## Learning & Development delivery — 2026-10-22

The user's current instruction authorizes Learning & Development; its earlier deferral is superseded for this phase. All four Learning routes are now Live after schema/API/workflow/browser/build verification. The existing Payroll limits and separately owned Banking work remain outside this change.

- Training Programmes provides versioned drafts and independent publication, immutable published rules, category, delivery mode, provider, required training minutes, estimated participant cost/currency, learning objectives, mandatory status, minimum attendance, optional assessment pass mark, certificate validity and active prerequisite programmes. Open requests/sessions block archival. Estimates support HR review and create no Accounting, Payroll or Banking posting.
- Training Requests supports personal requests and authorized HR requests, draft editing, submission to the current effective reporting-manager account, separate manager and HR decisions, rejection/cancellation, expected versions and retained decision history. A requester/affected employee cannot approve their own request, and the manager cannot also provide HR approval. Optional approved Performance goal/outcome references must match the company/employee and require current Performance read authority; Learning-only readers are not given the Performance catalogue.
- Training Sessions schedules ordered absolute-time lessons and capacity, checks the required programme duration, accepts matching approved requests, enforces current approved employment/prerequisites, rejects duplicate seats and employee schedule overlaps, and retains withdrawals. Future lessons do not offer attendance or completion actions; enrolled requests are removed from the available-seat selector. Attendance records actual minutes, explicit zero-minute absences, optional assessment score and verified evidence references. Over-crediting minutes and future attendance are rejected. Sessions close only after lessons finish and participants are completed or withdrawn.
- Completion & Certificates freezes source/evidence snapshots and derives attendance percentage and pass/fail from published programme rules. A separate certifier must differ from the proposal author, actual assessor and affected employee. Finalization atomically completes participation, fulfils its approved request and issues a certificate only on a pass; failed learning stays in history. A submitted proposal can be independently returned as voided before correction, retaining the old evidence. Revocation blocks downloads and restores mandatory gaps; fulfilled requests permit renewal/retake requests without rewriting prior learning. Expiry and prerequisite checks use retained validity windows. Certificate completion/expiry dates are UTC and are verified independently of PostgreSQL session timezone.
- Employee Self-service gains My learning with owned programme/request/session/completion views, request submission and authorized internal certificate downloads, without adding HR-wide permissions. The nested tab selection remains controlled during mutations so a save cannot leave an empty personal panel. Shared busy state protects company/month/tab changes during writes. The personal API rejects unrelated employee selectors and employer-wide reads.

Backend: versioned /api/v1/hr/learning reads/actions and authorized certificate reads, shared strict contracts, generated client and OpenAPI, one independent API service and forced-tenant-RLS records/events. Seven normalized Learning permissions are seeded only to active existing super-administrator policies; ordinary operators need explicit Security grants. Company access and normalized role/ownership authority are rechecked before idempotent replay. Manager retries remain valid after state advancement only while the current routed manager retains authority. Certification retries consult immutable assessor evidence, avoiding duplicate decisions/certificates after participation completes. Expected versions, company serialization, CSRF/origin/session checks, immutable platform audit and one event per record version cover writes. HR121–123 are additive migrations; applied migrations were not edited.

The persistence guard retains published terms and identities, restricts legal transitions and independent decisions, and requires exact immutable change evidence. Deferred completion constraints reconcile the participant, fulfilled request, finished lesson schedule, actual attendance, assessment, pass/fail, certificate expiry and independent assessor. UTC completion dates have a dedicated Pacific/Niue database-session regression. Failed, revoked, expired and pending completion states cannot be downloaded as valid certificates.

UI uses shared Tailwind/shadcn controls, company picker, semantic theme tokens and the global sans font. No feature stylesheet or local palette was introduced. The standalone internal certificate renderer escapes record HTML, sanitizes and uses the actual global font, and identifies its retained record rather than claiming external accreditation or exposing a public verification URL. Downloaded copies state that current validity must be checked in ERP. Native date/time inputs display local entry times; lessons are stored as absolute instants. The existing 100-company picker bound remains an earlier shared-directory limitation, not a new Learning pagination guarantee.

Validation: 81 distinct automated checks — 50 integration (Learning 17, personal portal 7, existing corrections/reporting governance 26) and 31 HTTP/session/document checks (Learning API 17, certificate HTML security 2, existing personal portal/session 12). Learning coverage includes personal ownership, real manager/HR routing, published-rule immutability, capacity and future-attendance protection, derived pass/fail, return-for-correction, revocation/renewal, prerequisite/Performance guards, current-access idempotency, immutable history, forged/impersonated actors, UTC timezone behavior and manager/certifier retry safety. Full typecheck, focused ESLint, production Next build, generated API/catalogue parity, theme write/check and git diff whitespace checks passed. Existing unrelated lint findings in large legacy source/client files were not represented as a clean full-repository lint run.

Isolated Chrome acceptance used distinct employee, reporting-manager, evidence-recorder and certifier accounts: real programme creation and independent publication, finished-lesson attendance/assessment entry, completion proposal, independent certificate issue/HTML download, a subsequent personal request, manager then HR approval, future session creation/scheduling and actual enrolment. The personal employer-wide read is denied. Four HR routes plus the personal portal, editor/review/register states were checked in light/dark at 1440/768/390/320: no root/section horizontal overflow, font overrides or JavaScript errors. Narrow screenshots were visually inspected. Artifacts: D:/Xyric Work/ERP_Nexora/tmp/recovered-hr-work/learning-phase/browser-result.json and matching PNGs. Theme audit: 0/79 direct feature-view font exceptions and 5/79 pre-existing direct color-exception files (6.33%); these measure source files, not all ERP routes.

Normal rollout: preflight allowed only HR121–123; normal/isolated schemas are HR123, tenant-registry FORCE RLS is restored, and the non-superuser/non-BYPASSRLS runtime has required privileges on both new forced-RLS tables. The compiled API is restarted on 4000 and web remains 3000. Read-only normal acceptance checks all four Learning API sections for 200/no-store and all four routes for real company-backed loading; unassigned company is denied and anonymous Learning/certificate reads require login. No normal training business records were seeded. The temporary isolated API is stopped after verification.

Remaining HR scope: Payroll Runs and Payroll Review & Approval retain In-progress labels and their documented production statutory/FX/dimension/correction limits. Payment Batch remains Read-only pending the separately owned Banking integration. Learning has no remaining prototype menu entries. Further Payroll/Banking acceptance and additional report types must be assessed against their owning domain rather than inferred from these menu counts. Existing Banking/Finance posting diffs are preserved (64/42 and 17/7 lines respectively at final review).


## 2026-10-22 — Payroll return and comparison UI

Payroll Runs and Payroll Review & Approval now share HrPayrollRunComparison: exact retained-run totals and differences, amount/evidence-only categories, revision/filter selection, bounded paging and immutable fingerprint drilldown. Returned-period guidance explains required input approval/recalculation; actor-specific submission/review buttons follow the existing server decision evaluator. Earlier/current/net-change values use separate responsive rows, and approved originals no longer show a preliminary hint. Shared controls, semantic tokens and global sans typography are used throughout; no stylesheet was added or removed.

Verification: 117 distinct focused integration/API/calculation checks, full typecheck, focused ESLint, generated API/catalogue parity, production build, theme write/check and git diff --check. Chrome executes the complete production-executor correction/recalculation/comparison/approval flow with independent actors; light/dark at 1440/768/390/320 have no root/workspace overflow or JavaScript errors and inherit the global font. The normal instance is checked read-only for real company loading and both Payroll routes. Screenshots/artifacts are under D:/Xyric Work/ERP_Nexora/tmp/recovered-hr-work/payroll-review-phase. Source audit remains 0/79 direct view font exceptions and 5/79 existing color-exception views (6.33%); the new shared comparison makes 232 application source files.

Safe resume: the two Payroll screens remain In progress for advanced statutory/context segmentation, required dimension/FX allocations and general posted-Payroll corrections. Payment Batch remains Read-only under separate Banking ownership; Learning remains delivered. Review the latest HR delivery checkpoint before continuing. Preserve the Banking/Finance posting edits and global token/font rules.


## 2026-10-22 — Dated statutory evidence and rule-authoring guidance

Payroll Runs and Review & Approval now expose each retained statutory context period and its source fingerprints inside the employee evidence card. Publisher guidance in Pay Components explains the optional reviewed monthly allocation basis, before-rounding behavior and full/partial vector inputs; source rates and policies remain independently governed. Existing settlement corrections now replay all frozen context groups and YTD evidence without rewriting original results. Both views retain existing company selectors, action handlers, approval rules, error/empty states and protected financial workflows. No stylesheet, fixed palette or font override is introduced.

Verification: 80 integration and 137 focused unit/API/calculation checks (223 distinct), full typecheck, focused lint, generated API/catalogue parity, production build, theme write/check and diff whitespace checks. Chrome verifies actual two-version publication/execution, dated evidence, correction/recalculation/comparison and final independent approval, plus publisher guidance, in both themes at 1440/768/390/320. Root/workspace/dialog overflow and inherited global fonts are checked; screenshots are inspected. Artifacts: D:/Xyric Work/ERP_Nexora/tmp/recovered-hr-work/statutory-context-phase. Source audit remains 0/79 view font exceptions, 5/79 existing direct color-exception views (6.33%) and 232 application source files. These figures do not measure all ERP route completeness.

Safe resume: normal/isolated schemas HR127. Continue governed dimension mapping, scoped jurisdiction overrides and Payroll correction/FX work within the owning domains. Banking remains separately owned; preserve its existing edits and Payment Batch Read-only state. The two Payroll menus remain In progress. Check the latest HR delivery checkpoint before extending calculation or posting semantics.


## Payroll Journal cost-centre preparation and review

HR128 adds required whole-account cost-centre selectors, literal company catalogue search, preserved selected labels, a cost-centre column on reviewed lines and explicit allocation-scope guidance. No feature stylesheet, palette or font override was added. The existing shared form, table, button, input and semantic token controls remain the presentation authority. Existing company/month/posting-date selection, immutable evidence/history and independently authorized actions are preserved.

Chrome verified preparation, independent review and posted journal at 1440/768/390/320 px in light/dark, including required selection, filtered empty catalogue, preserved labels, focus, disabled controls and errors; root/workspace widths and global font match with no page errors. Screenshots under `tmp/recovered-hr-work/payroll-dimensions-phase/cost-centre-{preparation,independent-review,posted}-{light,dark}.png` were inspected. API4000/web3000 passed normal read-only smoke with populated company selectors. The production build and 165 automated checks passed. Theme source audit remains 79 feature view files, 0 direct font exceptions and 5 existing colour-exception views (6.33%); 232 application source files include 9 colour-candidate files/46 lines. These source-file counts are not screen-completion percentages.

Safe resume: keep the whole-account allocation boundary visible. Do not infer employee-level splits, other Finance dimension values, country rules or Banking ownership. Preserve normal/isolated HR128 evidence and global controls during further Payroll work. Existing Banking/Finance diffs remain 64/42 and 17/7 lines respectively.


## Payroll Runs and Review live-status completion

Payroll Runs and Payroll Review & Approval are now Live for the supported API-backed production scope after their calculation, return/recalculation, comparison, independent approval, retained statutory/jurisdiction evidence and Finance-journal handoff paths passed focused unit, integration, type, build, catalogue and theme checks. The routes retain responsive Tailwind/shadcn presentation, semantic tokens, global typography, permission/error/empty states and immutable audit behavior; no feature stylesheet or mock fallback was added.

This menu completion is not an assertion of universal Payroll coverage. Unsupported employee/proportional dimensions, non-parity loan FX, general post-posting corrections, cross-country execution and additional legal allocation laws remain explicit fail-closed domain boundaries. Payment Batch remains Read-only under Banking ownership. Safe resume is the owning backend contract for one of those bounded capabilities, not further presentation work on the two completed screens.


## Employee Payroll jurisdiction setup, revocation and retained evidence

Added two governed sections inside the existing Pay Components setup surface, with bounded company employee/placement/category/reference lookups, clear category/ancestor scope guidance, exact copied revocation dates and independent-review messaging. Approved request history and current revoked fact state are displayed separately. The legal basis uses shared Textarea with native length validation. Payroll results display frozen category/jurisdiction/date/approval references, while changed setup removes stale submission until recalculation. No page stylesheet, fixed palette or custom font was introduced.

Chrome verified actual authoring, independent approval, calculation, revocation, explicit revoked status, stale submission block and recalculation/approval. Dialogs and evidence passed light/dark 1440/768/390/320 widths with no root/workspace/dialog overflow or page errors and with the global sans font. Screenshots under `tmp/recovered-hr-work/payroll-jurisdiction-phase/jurisdiction-{authoring,calculated,revocation,revoked-record}-{light,dark}.png` were inspected. Production build, full typecheck, focused lint, API/catalogue parity and 246 distinct automated checks passed. Normal API/web read-only smoke covers both sections and populated company selectors. Theme audit remains 79 feature view files, 0 direct font exceptions and 5 existing colour-exception views (6.33%); 232 application source files contain 9 colour-candidate files/46 lines. These counts are not percentages of menu screens.

Safe resume: preserve the same-country category boundary, exact published allocation policy, immutable historical approval/fact distinction and HR129–130 evidence/submission guards. Do not infer cross-country rules or employee-level accounting splits. Payroll retains its remaining delivery labels and Banking remains separately owned. Banking/Finance source diffs were preserved at 64/42 and 17/7 lines respectively.
- `/#/banking/bank-receipts` uses a bounded, company-scoped PostgreSQL-backed
  directory with Bank Account, lifecycle, date, search, sort and cursor state;
- `/#/banking/add-bank-receipt` persists reload-safe multi-line drafts, payer
  snapshots and submission through the typed Banking client; and
- `/#/banking/transaction-detail/{bank-receipt-id}` performs independent
  approval, explicit Finance posting and linked compensating reversal.

Chromium acceptance passed for the distinct maker/checker/poster workflow, the
governed `shoaib` self-approval exception, restricted-session denial and 390px
usability. PostgreSQL evidence confirmed balanced journals, immutable original
posting evidence, zero net Bank control movement after reversal and a linked
approval-override event. Export, print, attachments and customer/invoice
allocation remain explicitly unavailable because governed endpoints do not yet
exist for those capabilities.

Bank Nominal / master-data integration batch (2026-10-20):

- Added `app/features/finance/views/finance-nominals.tsx` and its typed API
  adapter. Banking Add Bank Account and Finance Add Nominal use one Tailwind /
  shared shadcn form. Name, generated nominal code, description and Currency
  Master replace mandatory external bank/branch/account-number inputs.
- Added live nominal directory/detail/history and governed decision dialogs;
  Bank Account detail routes resolve nominal-only accounts to that workspace.
  Legacy detailed account behavior remains available, with a separate legacy
  approval queue. Payments/Receipts/Account Balances tolerate absent external
  banking identifiers. No stylesheets were retired and no HR views changed.
- Backend/database tests cover canonical identity, approval, selector eligibility,
  audit history, company-scope permissions and balanced Payment/Receipt posting.
  Production build, type checks and phase-owned lint passed during the batch.
  Browser acceptance is pending: credentials were unavailable. The new browser
  test is `tests/e2e/bank-nominals.spec.ts`; do not report it as passed.
- Resume from the latest checkpoint in
  `docs/superpowers/plans/2026-10-20-bank-nominal-master-data-implementation-plan.md`.
  Complete its reconciliation account selector and isolated acceptance gates
  before declaring this slice finished. The full Bank module is NOT complete.

Other Banking pages, including transfers, statement import, reconciliation,
charges/interest, cheques/deposits and Treasury, remain explicitly prototype
surfaces. The next candidate production Banking slice is Bank Transfers and
requires a separate approved design and implementation plan.

Bank approval and action-feedback follow-up (2026-10-20, user-confirmed):

- Active Bank nominal/account, Payment and Receipt mutations now use a shared
  feedback context connected to the existing shell notification stack. Success
  messages appear only after API confirmation and survive navigation. No CSS
  was removed or added; no HR view changed.
- Approval does not request a reason, including super-admin approval. Rejection
  inputs appear only when rejecting and remain server-validated. Automatic
  approval evidence is explicit and audited; reversal safeguards are unchanged.
- Nominal “Approve & Close” closes its confirmation dialog on success. Chromium
  verified persisted creation/update/submission/approval/deactivation/rejection
  notifications, a reason-free approval, reload persistence and no success on an
  injected failed update. Payment/Receipt component tests cover their reason and
  success/error behavior; database tests cover their actual persisted lifecycles.
- Focused verification: 58 unit/API/component tests, 29 integration tests,
  26 security tests and one Chromium workflow passed. Production build,
  typecheck, generated API consistency, Bank-owned lint and whitespace passed.
  This does not close the wider Bank module or all BN acceptance gates.

Bank Payment/Receipt entry workspace (2026-10-20, user-approved):

- Updated both API-connected entry forms to the reference seven-column grid:
  Date, Ref. No., Mode, Nominal Account, Details, Amount and Remove. Company
  and posting date remain visible; Bank is above the grid. Receipt payer and
  required dimensions are preserved. Document references, optional value date
  and accounting preview are expandable. No stylesheets retired; no HR changes.
- Shared Bank-only split completion actions retain draft/submission and add
  authorized super-admin Approve & Close using existing versioned APIs. Server
  eligibility is checked after submission, retry keys survive failed decisions,
  partial progress is retained, and no posting API is called.
- WHT deduction is deferred to Supplier Payments; future WHT Remittance settles
  withheld liabilities. No placeholder WHT menu, tax rates or schema added.
  Approver routing, delegated self-approval and Project/City master selectors
  remain later phases rather than silently changing current approval policy.
- Verification: 56 focused Bank unit/component tests, four persisted lifecycle
  tests on the isolated test database, two read-only Chromium workflows,
  typecheck, focused lint, whitespace and production build passed. Browser
  checks used live directories but blocked all Bank financial writes.
- Resume: configure eligible offset nominals and fiscal periods for the chosen
  local test company before full browser save/approve/post acceptance. The
  default browser company currently reports no eligible offset nominals.
  See docs/superpowers/specs/2026-10-20-bank-entry-workspace-design.md.
  Do not mark the whole Bank module complete from this screen update.

Shared Finance nominal master (2026-10-20, approved implementation):

- Chart of Accounts overview now uses the same PostgreSQL-backed directory as
  Nominals instead of finance-profile fixture rows. The shared form supports
  ordinary asset/liability/equity/revenue/expense nominal creation; Banking's
  Add Bank Account remains restricted to Cash & Bank. No new stylesheet,
  presentation framework or HR change was introduced.
- Payment and Receipt forms search the scoped API by nominal name/code beyond
  the first 100 results and preserve selected identities. Required dimensions,
  receipt payer identity, approval controls and explicit posting are preserved.
- Finance migrations 11/12, scoped lifecycle/audit/idempotency and database
  guards are in place. Existing Bank behavior remains covered by regressions.
- Verified: 107 unit/component tests, 36 isolated integration tests, 19 database
  security tests, one real Chromium ordinary-nominal-to-Payment-draft workflow,
  API generation consistency, typecheck, focused lint, whitespace and web build.
  Source application health is ready. No journal or posting period was created.
- Resume: see docs/superpowers/plans/2026-10-20-shared-nominal-master-implementation-plan.md.
  Business catalog import needs review of docs/architecture/nominal-catalog-import-review.md;
  synthetic UAT section setup is not a production Chart of Accounts adoption.
  Other Finance reports and wider Bank prototype pages remain outside this batch.

Business Chart of Accounts reference follow-up (2026-10-20):

- The user's supplied four screenshots supersede the old 23-row prototype
  proposal. Recorded the 14-category mapping and 78-section transcription in
  docs/architecture/nominal-catalog-import-review.md for source validation.
- No screenshot-derived business records were inserted. Nominal pages are
  downscaled and contain overlapping codes (711314 and 711306); obtain exports
  or original-resolution files before certifying the complete import manifest.
- Confirm destination company/currencies and resolve the existing single
  Cash & Bank policy before importing section 2309. Preserve account IDs,
  historical events and control-account posting restrictions.
- Payment layout and persisted approver/project/location routing requests
  remain pending; this documentation checkpoint does not complete them.

Central Chart of Accounts approach (2026-10-20, user approved):

- Use a tenant-owned central definition template with separate company account
  identities; do not share company balances, transactions or Bank facilities.
- Written design: docs/superpowers/specs/2026-10-20-central-chart-template-design.md.
  Written specification is now user-confirmed. CT-01 stores the workbook's
  14 categories, 78 sections and 234 distinct nominals centrally without picking
  a destination company or inventing currencies. CT-02 adds Master Data browsing;
  CT-03/04 handle explicit company adoption and existing financial governance.
- CT-01 is implemented: Finance migration 13, immutable tenant-owned catalog,
  explicit template permissions, bounded generated import/read/publish APIs and
  authenticated source import. Published metadata is 14/78/234 with 237 source
  references; replay adds no duplicates. No company adoption has run.
- Verified 44 isolated integration tests, 13 unit/API tests, 19 database-security
  regressions, API consistency, typecheck, focused lint, web build and whitespace.
  Fresh API sessions and new database connections verified persistence; no
  application/DB reboot was performed. HR and Bank readiness are healthy.
- CT-02 complete: Central Master Data navigation, live template tabs, server
  search/category/section filters, pagination, source/detail evidence, drill-down,
  permission/loading/empty/error states and responsive layout. Section Management
  opens central Sections; company accounts stay separate and cross-linked.
- CT-02 verified: 21 unit/API/component tests, eight isolated integration tests,
  one read-only Chromium workflow, final desktop/mobile visual review, API
  consistency, typecheck, owned lint, whitespace and web build. No new migration,
  company adoption or financial writes in this UI phase.
- Legacy catalogue generation/check remains blocked by pre-existing imports of
  missing app/hr-core-data.ts and old root paths. No fake parity output or HR
  rewrite; actual new navigation was verified in Chromium.
- CT-03 preview implemented and browser-verified through normal API/PostgreSQL.
  Accessible company/currency selectors, proposed counts, paginated identity checks,
  stable snapshot hash and explicit conflicts; no apply/write action. Nine isolated
  template integration tests passed. Existing R06 UAT is user-confirmed for testing;
  NO new business company. Current preview proposes 227 ordinary drafts and seven
  Bank references, blocked on existing UAT-BN-CB versus template section 2309.
- Next: obtain explicit preserve-existing-Bank mapping decision, implement atomic
  company mapping/governed drafts, then CT-04 classification and activation. Do not
  replace Bank policy/reparent accounts or present references as approved offsets.

Latest Excel-alignment checkpoint (supersedes the pending Bank decision above):

- User approved the Excel business section code and written migration design.
  Finance 14 evidence and privileged local operation are applied. Existing section
  is now 2309 / Cash and Bank with its ID unchanged; all Bank leaves/history stay
  intact. New allocations use 2309xx, reserving 01–07 for workbook identities.
- Fresh API preview: zero conflicts, two header matches, 227 proposed ordinary
  drafts, seven Bank references. No company/accounts or financial transactions
  created by this correction. Source HR/Bank readiness remains healthy.
- Seven integration files passed (51 tests) plus 19 security regressions.
  Exact commands/evidence and next steps are in the central chart delivery plan.
- Next: atomic company adoption/mappings and governed drafts, then classification/
  activation. Do not represent pending drafts or references as approved offsets.

Company Chart adoption/review checkpoint (2026-10-20):

- CT-03 delivered and applied: existing R06 UAT has all 326 source mappings,
  227 persisted ordinary drafts, and seven explicit Bank references. No new
  company, guessed Bank currency, transaction or automatic approval.
- Existing setup preview now supports confirmed company draft adoption with real
  saved/already-adopted/error/retry states. Nominal detail has explicit posting
  review and confirmed notifications; normal Finance submission/approval follows.
  Unreviewed/module-controlled records are blocked from manual activation.
- Finance company pages now display truthful Live Finance API context, not mock
  company/role/state controls. Other module shell behavior was preserved. Existing
  Input labels received explicit IDs for accessibility; no new CSS/dependency.
- Central checklist records Finance 15–17, backup, exact test commands and failures
  corrected without suppressions. Actual business classification/approval and
  seven Bank definitions' setup remain operator acceptance, not automatic import.

- Finance 18 completes the Bank-reference setup UI/API integration: select an
  approved Excel Bank definition in the existing form, preserve source code/name,
  explicitly select currency, then use normal Bank draft/approval. Configured
  definitions are disabled and bindings are immutable/audited. Custom numbering
  remains separate. No actual Bank references were created automatically.
- Live-account context labels also cover Bank Accounts, Setup, Detail and
  Approvals only; unrelated Bank prototype screens and HR were not relabelled.
- Final focused verification: 58 integration, 27 unit/API/component and 19 security
  tests; two Chromium workflows; typecheck, owned lint, API check, build and
  whitespace. Actual posting classifications/currencies/approvals remain operator
  decisions, not absent persistence or missing setup controls.

## 2026-10-21 — CoA directory isolation and Bank entry fields

- Preserved the existing database-connected central template/company adoption.
  Fixed stale company/filter/pagination responses in the CoA directory, immediate
  row/cursor clearing on selection change, and directory reset on tenant/user/
  permission changes. Added six focused directory regressions.
- Both Bank forms now expose value date with posting controls and plain optional
  document-reference inputs in Details. Free-text descriptions, API payloads,
  receipt payer, accounting dimensions, approval auditing and explicit posting
  are unchanged. No stylesheet/dependency/migration or business activation added.
- Read-only Chromium verified the persisted central catalog and both Bank forms
  with desktop/narrow layouts, real API directories and financial writes blocked.
- Selectable approvers, authorized delegated self-approval, persisted project/city
  masters and authenticated active-company context remain the next backend-led
  slice, not completed by these presentation refinements. HR statutory work
  locations must not be repurposed without a reviewed ownership decision.
- Exact test/check results and the next safe boundary are recorded in the central
  chart implementation plan's 2026-10-21 continuation checkpoint.

## 2026-10-21 — approved Bank-context shared master backend

- Written Bank-context specification approved; WC-01a database/contracts/repository
  and WC-01b API/OpenAPI/generated-client portions delivered. Separate shared
  Project/Location records preserve HR statutory master ownership. Local UAT has
  additive master_data migrations 1–2, with backup and unchanged financial counts.
- This is backend delivery only: existing Bank entry UI is preserved. Shared
  management navigation/screens, typed Bank selectors and selected/delegated
  approver UI/persistence remain unfinished. No placeholder actions were exposed.
- Next agent should follow
  `docs/superpowers/plans/2026-10-21-bank-workflow-context-implementation-plan.md`:
  finish WC-01b management UI and browser acceptance, then WC-02 and WC-03. User
  already approved the written design; do not restart the approval loop.

## 2026-10-21 — shared master management and Bank workflow context

- Supersedes the backend-only checkpoint above: existing Finance navigation now
  exposes Reporting Master Data Projects and Locations / Cities. Shared Tailwind/
  shadcn workspace implements real company-scoped list/search/pagination, create,
  persisted detail, edit and status with explicit permissions, retry/version/dirty
  handling and loading/empty/error/denied/success states. No mock fallback/CSS added.
- Payment/Receipt entry grids now use real searchable Project/Location/Approver
  selectors and persist typed IDs through the generated API. Single-company users
  see an authenticated caption; multi-company selection remains authorized/explicit.
  Existing nominal/date/description/partial-save/idempotency behavior is preserved.
- Detail views show names/assigned checker, restrict decision affordances and keep
  dense tables locally scrollable at narrow widths. Approval still does not post.
  Shared masters do not replace HR statutory locations or affect HR workflows.
- Executed verification: full unit 411, selected integration 46, full security 41,
  HR approval integration 3, contract 12; four real API/PostgreSQL Chromium flows,
  mobile layout assertion/inspection, typecheck, scoped lint, generated API check,
  production build and whitespace. Latest caption-focused unit rerun passed 32.
- WC-03 remains partial: ordinary delegated self-approval/Identity management and
  audited submitted-record reassignment are not implemented. Safe resume, exact
  commands, schema/backup evidence, permission setup and acceptance limitations:
  `docs/superpowers/plans/2026-10-21-bank-workflow-context-implementation-plan.md`.
- Final compatibility guard is additive Finance 21: old free-text dimensions do
  not block compensating reversal. Two new isolated trigger probes and the final
  four-file/19-test Bank/migration regression passed. Broad shell lint still has
  11 inherited prototype label-association errors; feature-owned scoped lint
  passed, not a claim that whole-repository lint is clean.

## 2026-10-21 — WC-03 governance completed (supersedes partial checkpoint)

- Identity & Access Roles & Permissions now includes Bank Self-approval: real
  company/kind-scoped grant issue/revoke, searchable eligible users, versioned
  history and explicit global-administrator plus read/manage permission checks.
- Bank Payment/Receipt entries support explicitly delegated self approvers;
  detail screens include audited administrator reassignment and assignment history.
  Normal independent approval/global override and separate Finance posting remain.
  Grant revocation blocks future self decisions, not immutable past approvals.
- Explicit Project/Location read/manage authorization is enforced by UI/API and
  serialized against Identity revocation. Tailwind/shared primitives reused; no
  new CSS or dependencies, no source business grants/data activation.
- Observed checks: 420 unit, 68 selected integration, 41 security, 12 contract,
  six real Chromium/API/PostgreSQL workflows, 390px Bank detail checks, typecheck,
  API consistency, feature-owned lint, production build and whitespace all passed.
  Whole-repository lint was run and remains blocked by 112 inherited errors /
  one warning across unrelated legacy surfaces; no suppression or broad refactor.
- Additive source schema: Finance 23 / Security 16; source readiness healthy,
  financial/master counts unchanged, new governance tables empty. Operator manual
  UAT and intentional source permission/grant assignment remain. Full evidence,
  isolated harness, migration/backup details and safe resume are recorded in
  `docs/superpowers/plans/2026-10-21-bank-workflow-context-implementation-plan.md`.

## 2026-10-21 — Bank nominal selector diagnostics and recovery

- Payment/Receipt nominal selectors already used the real company Chart of
  Accounts API/query. Source R06-UAT has zero eligible offsets: imported nominals
  remain governed drafts, other ordinary accounts inactive, active leaves protected.
  No account was bulk activated and no eligibility/permission rule was bypassed.
- Both entry views now reuse a shared Tailwind/shadcn availability alert with
  server-derived company counts, review navigation, refresh, separate search-miss
  messaging, failure retry and selected-option preservation on search failure.
  No CSS retired/added; existing draft lifecycle, dirty guard, audit and posting
  controls intentionally preserved.
- Shared Bank directory projection reuses existing account records and adds
  optional metadata; contracts/OpenAPI/client regenerated. Tests cover the real
  catalog review/independent approval → both selectors → saved/reopened exact IDs.
- Actual unit/integration/security/contract results: **427 / 69 / 41 / 12 passed**;
  new real-browser catalog scenario, typecheck, API consistency, production build,
  feature-owned lint and whitespace passed. See workflow handoff for final browser
  regression results, isolated setup and inherited lint limitations.
- Operator review/approval of intended source nominals remains necessary; a
  successful import is not financial activation. Full investigation and next
  action are in the existing Bank workflow context implementation handoff.

## 2026-10-22 — Bank Receipts full-flow parity checkpoint

- Reviewed the current Bank Receipts directory, add/edit workspace, persisted
  detail, shell routing, generated-client boundary and lifecycle tests directly
  against the accepted Bank Payments implementation. The current working tree
  already contains the required functional parity: company/account/state/date
  filtering, search/sort/pagination, multi-line drafts, payer snapshots,
  workflow context, validation, save/reload, submission, governed decisions,
  explicit Finance posting, compensating reversal and responsive states.
- Preserved Receipt-specific accounting direction: Bank control is debited and
  nominal allocations are credited. The approved entry refinement replaces the
  separate Received from and optional narration controls with one required Details
  textarea. Its value is written to both existing `payer_name` and `narration`
  fields so persisted/API compatibility and payer snapshots remain intact; older
  drafts reopen from narration with payer name as the fallback. No permission,
  API contract, migration, posting rule, source business data, dependency or
  feature stylesheet changed in this parity review.
- Formatted the Receipt directory and its list regression test to repository
  standards. Focused Receipt UI rerun passed 32/32; the Payment/Receipt comparison
  baseline passed 54/54; targeted persisted Payment/Receipt integration passed
  20/20. After the single-Details refinement, the focused Receipt UI rerun again
  passed 32/32. Scoped ESLint/Prettier, TypeScript checking and the production
  Next.js build passed. Lifecycle Playwright was not run because no explicitly
  isolated synthetic harness was started; the suite performs financial mutations
  and must not be pointed at the shared/source API.
- Safe next surface: Bank Transfer. Reuse Bank Payments' accepted visual and
  interaction structure, but first inspect the existing transfer contracts,
  persistence and posting semantics. Do not infer that Receipt completion makes
  a prototype transfer action financially live.

## 2026-10-22 — production Bank Transfer and Currency Master

- Bank Transfer now uses versioned contracts and the independent API service from
  repository through live directory, screenshot-aligned multi-line entry and
  persisted detail. It supports same-company Bank Account movements, governed
  effective-dated cross-currency rates, explicit approval, separate posting,
  compensating reversal, idempotency, audit evidence and optimistic concurrency.
- The Transfer grid keeps exactly one Details control per line and displays the
  linked source Bank control nominal. Narrow layouts scroll locally rather than
  compressing the accounting fields. The former fixture Transfer list/form/detail
  fallbacks are no longer routed for this surface.
- Finance navigation now exposes Currencies & Transfer FX. The immutable global
  catalog contains 20 major currencies; tenant adoption remains explicit. The
  live screen manages currency status, effective-dated rates and company FX gain,
  loss, rounding and bank-charge nominal policy through the API. No source tenant
  is auto-enrolled and no role receives the new permissions automatically.
- Additive schema heads are Platform 10, Security 17 and Finance 26. Payment,
  Receipt and Finance posting rate lookup now ignores inactive or superseded rate
  revisions. No feature CSS or dependency was added.
- Transfer entry now includes the same governed Project, Location / City and
  assigned Approver controls used by Bank Payments and Receipts. Persisted detail
  exposes assignment evidence and supports versioned approver reassignment with
  the immutable timeline retained. The directory uses bounded cursor pagination.
- Currency Master now exposes immutable rate correction: the operator supplies a
  replacement quote and reason, the previous active revision becomes superseded,
  and status changes require an explicit reason. Transfer/FX policy continues to
  select only live, posting-capable Chart of Accounts nominals.
- Fresh disposable PostgreSQL tests now execute the complete Transfer lifecycle
  (create, submit, independent approve, explicit post and compensating reversal)
  and the Currency lifecycle (catalog adoption, rate creation/correction and FX
  policy creation). Separate database-security suites assert forced RLS,
  immutable evidence triggers, lifecycle guards and the explicit permission
  catalog. The Transfer test exposed and fixed persisted numeric scale
  normalization before journal posting.
- Browser acceptance for the 390px directory and screenshot-aligned entry is now
  encoded in `tests/e2e/bank-transfers.spec.ts`; execution remains environment-
  gated by the existing synthetic Banking credentials.
- Repository completion evidence for this follow-up: full unit 480/480,
  contracts 12/12, fresh migrations plus Transfer/Currency disposable-database
  lifecycles 15/15, and database-enabled security 46/46 after excluding the
  fiscal-calendar suite that explicitly requires its own named isolated fixture.
  Generated API consistency, full TypeScript checking, scoped lint, the
  production Next.js build and whitespace validation also passed. The Transfer
  Playwright scenario compiles and enumerates successfully; its live execution is
  credential-gated.
- Deployment-only work remains intentionally external: apply migrations to the
  selected target, assign permissions to approved roles, deliberately adopt each
  tenant currency, configure company nominals/policy and run the credential-gated
  browser acceptance against that isolated environment. No shared or live tenant
  was mutated by this batch.

## 2026-10-23 — BR-08 live Bank Statement Import

- Replaced the routed Import Statement prototype with a responsive Tailwind and
  shadcn screen backed exclusively by the versioned Banking API. The screen now
  loads permitted companies, Bank Accounts, saved mapping profiles and server
  limits; uploads bounded CSV/XLSX files; downloads sample templates; restores a
  persisted import after refresh; and previews up to 1,000 server-parsed rows.
- Native-bank mapping supports CSV/Excel format options, header/date/amount
  conventions, all supported column bindings and optional profile persistence.
  Per-row inclusion, exclusion reasons, duplicate disposition, validation issues
  and aggregate counts remain server authoritative and version guarded.
- Validation and finalization use CSRF-protected, idempotent API mutations.
  Finalization is permission gated, disabled during read-only impersonation and
  explicitly stages included rows for reconciliation without posting the ledger.
  The statement import ID and Bank Account ID are retained in the reconciliation
  route so the live BR-10 workspace can consume the exact finalized source.
- Preserved the existing shell, fixture reconciliation register and unrelated
  Banking views. No stylesheet, dependency, database migration, deployment or
  production data change was introduced.
- Verification: focused UI/routing/client/contract/parser/mapping/service tests
  passed 44/44; full TypeScript checking, targeted ESLint and Prettier, production
  Next.js build and `git diff --check` passed.
- Safe resume point: BR-09. Replace the fixture statement history/register with
  the bounded live import directory and persisted detail while retaining the new
  BR-08 import route and avoiding any BR-10 reconciliation-workspace redesign.

## 2026-10-23 — BR-09 live statement and reconciliation register

- The routed Bank Statement now loads permitted companies and Bank Accounts,
  bounded finalized-import history and the selected persisted statement rows
  through the Banking API. It retains account/import/date/search controls,
  currency-aware totals, empty/error/permission states and cursor-bounded import
  history. Starting reconciliation preserves the selected finalized import ID.
- The reconciliation register now uses the live bounded directory with company,
  Bank Account, lifecycle, method, statement-date and search filters. It renders
  Draft, In progress, Waiting for approval and Approved consistently, aggregates
  loaded open items/differences by currency, and navigates with persisted IDs.
- Live routes import the new statement implementation directly; the legacy
  fixture statement module and fixture data remain untouched and unrouted after
  usage verification. Reconciliation worksheet/detail replacement is deliberately
  deferred to BR-10.
- Focused BR-08/BR-09 UI and route regression tests passed 13/13; targeted ESLint
  and Prettier passed. Safe resume point:
  BR-10 live matching workspace and persisted reconciliation detail.

## 2026-10-23 — BR-10 live reconciliation and matching workspace

- New and persisted reconciliation routes now use the versioned Banking API.
  Creation retains the finalized import/Bank Account route context, captures the
  statement period and balances, and opens the server-issued aggregate ID.
- The persisted workspace renders authoritative statement rows and posted Bank
  ledger candidates side by side. It exposes deterministic suggestion refresh,
  suggestion confirmation/rejection, explicit manual matching and reasoned
  unmatch operations with CSRF, idempotency and optimistic versions preserved.
- Server-returned statement, ledger, adjusted-ledger and difference balances are
  displayed without client-side accounting reconstruction. Submission is gated
  on zero difference and no unmatched statement lines; approval remains a
  separate server transition with independent-approver/audited-override guidance.
- Bank-only adjustment creation uses the selected statement line's immutable
  amount and a company nominal. Draft submission, independent decision, explicit
  Finance posting and compensating reversal remain distinct permission-gated
  actions. Approval alone never posts a journal.
- Legacy prototype fixtures are isolated behind explicitly named legacy modules;
  live shell routes import the API-backed statement/register/workspace directly.
  Focused workspace tests passed 5/5 and the reconciliation boundary, matching
  and adjustment regression set passed 14/14. Safe resume point: BR-11 isolated
  security and browser acceptance harness.

## 2026-10-23 — BR-11/BR-12 acceptance and controlled UAT cutover

- Added a fully isolated localhost acceptance harness for CSV and XLSX import,
  persisted refresh, mapping reuse, reconciliation matching, zero-difference
  submission and independent approval. Every run creates and removes only its
  validated random PostgreSQL database and MinIO namespace; Railway and the
  shared local database are untouched.
- Added governed, rerunnable Shoaib UAT provisioning. Two distinct tenant Security
  administrators create and approve one company-scoped overlay containing the 19
  new Banking permissions. Shoaib's existing tenant-scoped Super Administrator
  override is verified separately and is never copied into the overlay or added
  to a shared role.
- Added `docs/runbooks/bank-statement-reconciliation-operations.md` for parser
  limits, immutable-object retention, cleanup monitoring, readiness, workflow
  monitoring and safe resume. Automated provisioning creates no financial or
  synthetic statement data.

## 2026-10-23 — Manual reconciliation and imported ending-balance evidence

- Extended the live reconciliation workspace with separate reconciliation and
  statement-ending dates, server-derived opening balances, searchable manual
  transaction selection, available/selected receipt and payment totals,
  calculated balance, difference and governed submission for approval.
- Manual selections now use the authenticated, CSRF-protected, idempotent and
  version-guarded Banking API. Selection evidence and current state are stored
  company-scoped; approved reconciliations remain immutable and require an
  independent approver unless the existing audited Super Admin override applies.
- CSV and XLSX mapping profiles may optionally map a running-balance column. The
  latest eligible imported balance/date is retained as statement evidence and
  offered to the reconciliation form. PDF extraction remains intentionally out
  of scope because no reliable parser is configured.
- No feature stylesheet was added or retired. The screen uses Tailwind and the
  existing shadcn `Button`, `Input`, `Checkbox`, `Badge` and `Alert` primitives.
- The Reconciliation register, create route and persisted detail route now use
  only the API-backed components. The shell no longer falls back to fixture
  records and identifies the page as `backend connected`.
- Finance 0029 was applied to the explicitly approved localhost UAT database
  `nexora_source_test` at `127.0.0.1:55433`. A migration compatibility defect
  was corrected by defining the shared company-actor guard before the new
  manual-selection triggers. An immediate rerun made no changes.
- Focused routing, UI, API, readiness and migration tests passed 51/51; type
  checking, API contract synchronization, the API build and the production web
  build passed. The database-backed financial integration suite remains gated
  until it can use its disposable database harness or synthetic-data mutation
  is explicitly approved for a target.
- Safe resume point: complete authenticated browser UAT on localhost and, with
  an approved disposable database, run the reconciliation database security and
  integration suites.
- Live routes have no silent fixture fallback. The older statement and worksheet
  modules remain only as explicit compatibility proxies while unrelated Banking
  prototype surfaces still import shared legacy models; retire those fixtures in
  a separate selector/import-verified cleanup batch.
- BR-01 through BR-12 are implemented. The approved localhost target now reports
  Security 18, Finance 29 and Platform 10. No Railway deployment, production
  migration or provisioning rerun was performed in this cutover batch.

## 2026-10-23 — Live Import Statement work page and form alignment

- The base Import Statement route now renders a company-scoped, API-backed work
  page with Bank and Reference filters, bounded page sizes, cursor navigation,
  selection controls, persisted status and detail navigation. `Add New` opens a
  separate upload route; server-issued import IDs reopen persisted review.
- Directory rows now expose nullable From/To dates calculated by PostgreSQL from
  eligible existing statement lines. The contract, OpenAPI document and generated
  browser client were updated together; no schema migration was required.
- The upload form now follows the approved ERP reference with a compact Search
  panel, Bank/Date/File/template/upload flow, separate statement reference and a
  visible empty transaction table before upload. Single-company sessions remain
  automatically scoped without an unnecessary selector.
- CSV/XLSX security limits, native-bank mappings, row inclusion and duplicate
  decisions, CSRF, idempotency, optimistic versions, audit history, immutable
  finalization and reconciliation-only posting semantics were preserved. Audited
  imports have no delete action.
- Safe resume point: authenticated localhost visual UAT of the work page and
  upload/review form. Database-mutating integration coverage still requires the
  repository's disposable database harness or a separately approved target.

## 2026-10-26 — FXR-05 company currency work page and setup

- Finance Currencies and Configuration / Company, Fiscal & Currency now route
  to one company-scoped, API-backed workspace. The screen uses bounded search,
  status filtering, pagination, rate history and the approved country/base/FX
  table layout; no fixture fallback is used.
- The Add New form uses the shared searchable selector, automatically chooses a
  country's primary currency, exposes alternate legal mappings, and labels the
  rate direction explicitly as `1 FX = X BASE` with an effective date.
- Companies without a financial currency profile can configure their mandatory
  base currency before posting. The UI treats an existing profile as read-only;
  database/service locks remain authoritative after financial activity.
- Existing Bank Transfer FX policy editing remains available in a separate
  permission-gated panel. No feature stylesheet was added or retired; the work
  page uses Tailwind and shared shadcn primitives.
- Safe resume point: FXR-06 revaluation preview and draft authority. The new
  generated client methods become live when FXR-09 registers authenticated
  production routes; no persistent database migration or deployment occurred.

## 2026-10-26 — FXR-10 live Bank Revaluation work page and form

- Bank / Revaluation now routes directly to a company-scoped, API-backed work
  page. Currency, bank, lifecycle, date and reference filters use bounded API
  queries; cursor pagination, persisted vouchers and reversal state replace the
  generic prototype transaction form.
- The screenshot-aligned form loads active company currencies, performs a
  read-only authoritative Apply preview and displays rate evidence, effective
  date, bank-account calculations and base-currency totals. Save creates or
  updates a draft only.
- Persisted records survive deep links and expose permission/state-appropriate
  submit, approve/reject, post and reversal controls. Every mutation reloads the
  authoritative detail and immutable audit events; posted journal and scheduled
  reversal evidence are visible and no deletion action is exposed.
- Same-maker approval is explicitly identified as requiring the server's
  audited Super Admin override. All financial mutation controls are disabled
  during impersonation. No feature stylesheet was added or retired.
- Drafts now select from a bounded company-scoped directory of currently
  eligible approvers. The selected approver is persisted before submission and
  revalidated by the server; revoked or cross-company authority fails closed.
- Focused workspace and shell tests passed 5/5, the full TypeScript check and
  production web build passed, and the focused new files pass ESLint. Existing
  unrelated accessibility lint findings remain in `prototype-content.tsx`.
- Safe resume point: FXR-11 reporting integration and full security/regression
  acceptance. No persistent database migration, deployment or commit occurred.

## 2026-10-26 - FXR-11/FXR-12 acceptance and controlled UAT handoff

- Verified the reporting boundary consumes posted base-currency journal
  amounts and includes Revaluation/reversal journals in their posting periods.
  Full focused FXR, migration, database-security, contract, type-check and
  production-build gates passed against disposable databases.
- Added governed, rerunnable Bank Revaluation UAT provisioning. Two distinct
  Security administrators create and approve one company-scoped overlay with
  the 15 FXR permissions; Shoaib's existing tenant-wide override is verified
  separately and is never copied into the overlay.
- The provisioning regression proves reruns create no duplicate role,
  assignment, version or audit event and no rate, Bank Account, Revaluation,
  journal or accounting event. The new operations runbook documents cutover,
  worker monitoring and safe recovery.
- All FXR engineering tasks are complete. Safe resume point: obtain explicit
  approval of the exact localhost database host, port, name, user, tenant,
  company, Security maker, Security checker and Shoaib IDs; then apply Platform
  11, Security 19 and Finance 30 and run the governed provisioning command.
  No persistent database migration, deployment or commit occurred.
- Isolated browser acceptance now passes with three distinct authenticated
  actors through preview, draft, submit, independent approval, post and reload.
  Its random database, bucket and temporary web directory are removed after
  each run.

## 2026-10-26 - Banking 1Bill catalogue removal

- Removed the unused `one-bill` / `1Bill` entry from the Banking & Treasury
  navigation catalogue. There was no dedicated component, API or database
  behavior behind the generic prototype entry, so no live Banking workflow was
  changed or deleted.
- Synchronized the committed prototype manifest and reduced its page count by
  one. Bank Payments, Receipts, Transfers, Reconciliation, Import Statement and
  Revaluation remain unchanged.
- The existing catalogue generator cannot currently execute because it still
  imports obsolete root-level HR files. Safe resume point: repair those stale
  generator imports separately before relying on `catalogue:generate`; do not
  reintroduce the removed 1Bill entry.
