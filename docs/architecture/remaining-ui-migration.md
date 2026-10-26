# Remaining UI migration checklist

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
