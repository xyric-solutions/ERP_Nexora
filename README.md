# Nexora ERP web application

This directory is the canonical Nexora ERP web application. It contains the approved Next.js interface, Express API, BullMQ worker, PostgreSQL production migration chain, Redis-backed server sessions, private S3-compatible storage, shared contracts, observability, Docker Compose, and automated quality gates.

The approved ERP interface remains the visual baseline. `apps/web` reuses the existing `app/` source while production capabilities replace mock paths incrementally. Email/password authentication and the `/admin/identity` workspace are production-backed; business screens not yet connected by an accepted implementation wave remain explicit mock UI.

The prototype currently exposes **35 modules**, **146 navigation groups**, and **792 screen entries** through a consistent set of dashboard, list, detail, form, approval, workflow, report, and settings experiences. See [PROTOTYPE-INVENTORY.md](./PROTOTYPE-INVENTORY.md) for the complete module → group → page hierarchy.

## Safety and isolation contract

- All displayed companies, people, customers, suppliers, documents, balances, statuses, and transactions are invented fixtures from `app/mock-data.ts`.
- Frozen business-module screens do not call production APIs or mutate production data until their implementation wave is accepted.
- Buttons on those frozen business-module screens simulate visual outcomes only. The production login and Identity & Access workspace are exceptions and use real APIs, PostgreSQL, Redis sessions, authorization, and audit controls.
- Production code lives in this repository under `apps/` and `packages/`; no separate backend repository is required at runtime.
- URL state uses a browser hash such as `#/sales/invoices`; it is prototype navigation, not a production route or transaction identifier.
- Closing or reloading the browser resets temporary UI state.

This isolation contract applies to the frozen UI baseline. Wave 1 infrastructure exists beside it, but no mock business action is represented as durable or production-backed until that specific path is implemented and verified.

## Workspace layout

| Path | Purpose |
| --- | --- |
| `apps/web` | Next.js 16 App Router host for the frozen interface |
| `apps/api` | Express 5 API with authentication, authorization administration, health, readiness, errors, correlation, and metrics |
| `apps/worker` | BullMQ background worker with retry, persistence, and dead-letter handling |
| `packages/contracts` | Zod contracts, OpenAPI source, and generated web client |
| `packages/db` | PostgreSQL connection management and the ordered source-ledger production migrations |
| `packages/domain` | Framework-independent domain and private object-storage contracts |
| `packages/observability` | Structured redacted logging, metrics, and tracing seams |
| `packages/testing` | Shared deterministic test helpers |

## Run locally

Requirements:

- Node.js 24 LTS (`.nvmrc` pins `24.16.0`)
- npm 11
- Docker Compose for PostgreSQL/Redis integration checks and the local production-like stack

From this directory:

```powershell
npm ci
npm run dev:web
```

Then open <http://127.0.0.1:3000/>. The web application can run by itself for visual review. API and worker processes require the environment values documented in [`.env.example`](./.env.example).

For isolated database and queue dependencies used by the integration suite:

```powershell
docker compose -f compose.test.yaml up -d --wait
npm run db:migrate:test
npm run test:integration
docker compose -f compose.test.yaml down
```

The full local stack is defined in `compose.yaml`. Copy `.env.example` to an ignored local environment file, replace every placeholder with a local secret, and run `docker compose up --build -d`. The stack provisions separate migration and application database roles, applies the production migration chain once, creates a private MinIO bucket, and starts the API, worker, and web only after required dependencies are ready.

## Verify

```powershell
npm test
npm run test:integration
npm run test:e2e
npm run test:a11y
npm run test:performance
npm run api:check
npm run build
npm audit --omit=dev --audit-level=high
```

`npm test` is the deterministic default gate: formatting, linting, type checking, unit, contract, security, and frozen-prototype regression tests. Integration tests require the isolated Compose dependencies shown above. End-to-end and accessibility tests start the real Next.js application through Playwright.

## What is interactive

- Expandable/collapsible master sidebar with all 35 modules visible by default and nested page groups
- Hash-based navigation, breadcrumbs, module drawer, and global page search (`Ctrl/Cmd + K`)
- Company navigation variants for Service, Trading, and Manufacturing organisations
- A distinct theme for every designation, selected by `data-role-theme` on the prototype root: switch the Role
  control and the accent, active navigation rail, focus rings and chart colours follow the desk. The sidebar
  names the active designation above the module search.
- Visual role filtering for twenty personas: Chief Executive, CFO, Finance Manager, Accountant, Sales Manager, Sales Executive, Purchasing Manager, Procurement Officer, Inventory Manager, Warehouse Operations, Production Manager, Project Manager, HR Manager, Administrator, CRM Manager, Accounts Receivable, Accounts Payable, Tax Manager, Auditor, and read-only Viewer (which reuses the executive dashboard)
- Nineteen mature role dashboards (Chief Executive, CFO, Finance Manager, Accountant, Sales Manager, Sales Executive, Purchasing Manager, Procurement Officer, Inventory Manager, Warehouse Operations, Production Manager, Project Manager, HR Manager, Administrator, CRM Manager, AR, AP, Tax and Auditor) with monthly comparisons, composition charts, target-versus-actual driver graphs, quantified management insights, action queues, exceptions, and a governed minimum four-layer drill journey. Every KPI, chart, graph, queue item, exception and analytical row continues through progressively narrower dimensions to document detail and a complete source-transaction view.
- Mature Banking review flow with contextual Add actions, multi-line payment and receipt workpages, transfer entry, bank balances, account detail, statements, reconciliation/matching, and transaction drill-down
- `Bank > Reconciliation` opens a reconciliation register - ID, date, bank, code, currency, balance and open items per record, with live/awaiting-approval/open-item/difference totals, the shared list filters, and `+ Add New`. A record is either started by statement import (the file supplies the lines and closing balance) or by manual tick (the closing balance is keyed and posted entries are ticked as presented); the method is recorded because the two are not equivalent evidence. An account can hold only one live reconciliation at a time, and a submitted or approved record opens read-only with Print and Request reopen instead of Submit
- Three matured modules - Banking, Finance & Accounting, and Fleet Management - with domain screens instead of generic archetypes, including vehicle/driver 360-degree records, dispatch, trips, fuel, maintenance, compliance, incidents, whole-life cost and source-level drill-down
- Printable A4 documents (tax invoice, purchase order, statement of account, journal voucher) with letterhead, party blocks, a ruled line table, a totals ladder, amount in words and signature blocks - open the Document tab on any commercial record
- Record provenance on detail screens: created, last modified, source document, numbering and whether the trail is sealed
- Comfortable / Compact density, light / dark theme, and role, company and menu-scope choices, all remembered per browser
- Keyboard: `Ctrl/Cmd + K` or `/` for search, `?` for the guide, `Esc` to close - all listed in the help dialog
- Toggleable role-scoped and company-scoped menus; both default to All so the complete 35-module product can always be reviewed, and are visual demonstrations rather than security enforcement
- Responsive desktop sidebar, tablet layout, and mobile drawer/menu behaviour
- Dashboard cards and CSS charts; realistic tables, filters, pagination, tabs, forms, detail panels, reports, workflow timelines, approval queues, settings, and honest Coming Soon states
- Module-aware full-screen forms across all 35 modules, with domain-specific terminology, realistic control fields, editable line items, business context, validation checks, workflow previews, section navigation, responsive layouts and sticky save actions
- Purchase and Sales entry forms use a dense document workbench: lifecycle command bar, two-column commercial header, inline product and expense grids, balanced journal preview, related controls, full-width totals, and an activity/notes/files rail
- Manufacturing BOM and MO workbenches include controlled revisions, component tolerances, routings and work orders, by-products, quality gates, material reservations, cost/yield analysis, exception approvals, evidence and complete activity/audit visibility
- Data, Loading, Empty, and Error preview states
- Add, View, Edit, Save, Submit, Approve, Reject, Cancel, Delete, Post, Reverse, Print, Export, Filter, Search, Refresh, and More Actions demonstrations
- Mock confirmation dialogs, help, notifications, toasts, theme toggle, CSV export, and browser print

## What remains mock/demo only

- Business-module workflows not yet covered by an accepted production slice; authentication and Identity & Access are production-backed.
- Business-module database/API mutations, file-upload workflows, integrations, email/SMS delivery, OCR, and AI inference until their corresponding implementation slices are accepted.
- No accounting calculations, ledger posting, tax calculation, inventory movement, payroll calculation, bank reconciliation, document numbering, or audit evidence
- No durable create/edit/delete state; form values and action results are not stored
- Business approval routing outside Identity & Access, portal access, mobile offline sync, and company configuration. Identity & Access maker-checker, SoD, tenant scoping, last-administrator protection, and audit are production-backed.
- Five catalogue entries intentionally display a Coming Soon state: AI Automation Catalogue, AI Model & Policy Configuration, Cutover & Freeze Plan, Parallel Run & Rollback, and Offline Queue & Conflict

## Dashboard dates and period comparison

Every role dashboard carries one date control that answers both "which dates
am I looking at" and "how does that compare".

| Control | Options |
| --- | --- |
| **Period** | Today, This/Last week, This/Last month, This/Last quarter, Year to date, This/Last year, Custom range with From and To |
| **View by** | Day, Week, Month, Quarter, Year - this is the comparison granularity |
| **Compare** | No comparison, Period by period, Same period last year |
| **How many** | 2 to 12 periods, when comparing period by period |

So "View by: Year" plus "Compare: Period by period" plus "How many: 5" reads
five years side by side; switch View by to Week for week against week, or to
Day for day against day. "No comparison" collapses to a single period and
hides the comparison panel entirely.

**Every chart on the dashboard follows the selection.** There are two kinds,
and they behave differently because they have to:

| Kind | Charts | Behaviour |
| --- | --- | --- |
| **Range** | main trend, composition movement, KPI sparklines | one point per selected period |
| **Snapshot** | contribution bridge, stage funnel, composition donut and treemap, capability radar, relationship scatter, activity heatmap, target attainment | show one period, chosen with the **Showing** picker |

A snapshot chart cannot display a range, so the dashboard offers a period
picker: it follows the latest period whenever the range changes, and a
reviewer can click any period to move every snapshot chart to it at once.

What else the controls drive:

- **Every KPI tile** reports the change across the selected periods, against
  the first period in the selection, and its sparkline becomes that series.
- **A period comparison panel** lists every measure as a row and every period
  as a column, with an inline shape bar and the change. Direction of change
  uses the reserved status tones, never a series colour.
- **A period still in progress is flagged**, in the control bar, as a `*` on
  its column and again in the picker, so a half-finished month is never
  silently compared with complete ones beside it.

Two properties worth knowing:

- **The authored figure never moves.** Each KPI's series is built to *end* at
  the value in the dashboard fixture, so changing these controls never alters
  a number a reviewer has already approved - only the earlier periods and the
  comparison are derived.
- **Dates are real arithmetic, not label pools.** ISO week numbering across a
  year boundary, month-end clamping (31 March minus one month is February) and
  leap years are all handled and tested. The prototype's "today" is fixed at
  2026-09-17 so screenshots stay reproducible. The trend chart previously drew
  its axis from a fixed pool of labels, so "View by: Year" showed FY22-FY26
  while the comparison table showed real years; both now resolve from the same
  dates and cannot disagree.

Earlier periods are derived mock history, and the panel says so on screen.

## Drill engine

A recursive drill-down engine lives in [`app/drill/`](./app/drill) and follows the
project's drill architecture rules. Open **Finance -> Group & Reporting ->
Finance Drill-down**, **Sales -> Sales Reports**, **Purchases -> Procurement
Reports**, or **Inventory -> Inventory Valuation / Stock Ledger**.

- **One renderer.** `drill-renderer.tsx` is the only dashboard renderer; every
  layer is that component with narrower data. It holds no domain vocabulary and
  no module branch, and a test asserts both.
- **Registration, not code.** A module registers a fact view and a dimension
  chain in `registry.ts`. Four modules and six chains are registered. Dashboard
  journeys map to four-dimension chains and then continue to a separate
  source-transaction layer.
- **Correct by construction.** Every layer is a SUM over a strict subset of its
  parent's rows, so children always sum to the parent. There is no
  reconciliation logic anywhere.
- **Money is integer minor units**, never float, and `period` is precomputed on
  the row rather than derived in the UI.
- **One navigation array.** Breadcrumb, back button and Escape are three views
  of the same stack, and it serialises into the URL
  (`#/finance/finance-drilldown?path=section:Revenue/group:Trading`).
- **Uniform click intent.** Every visual emits a bucket and calls the same
  `descend`. On the multi-series trend the dataset index selects the series and
  the point index selects the period.
- **All six edge cases** are implemented: zero-value children explain
  themselves, a headline from another source says so, a single child gets a
  cumulative line, the partial edge period is excluded from comparison and
  labelled, the breadcrumb collapses in the middle past four levels, and
  changing the date range recomputes the open layer instead of closing it.

**Server rules are waived here, not faked.** This prototype has no server, so
whitelisted column resolution, parameterised SQL, tenant predicates and
in-database aggregation cannot hold. `registry.ts` keeps the whitelist seam
honest - a dimension id resolves to a column only through the registry and an
unknown id throws, where the real implementation must answer 400 - and
`types.ts` records the waiver. Aggregation runs client-side over in-memory
fixtures; that is the one rule this build does not satisfy, and it is the
reason the engine belongs in `web/` plus the backend when it goes real.

## Design register

The prototype is deliberately set in a classic institutional register rather
than a modern SaaS one. These are decisions, not defaults, and
`tests/design-system.test.mjs` enforces them:

| Decision | Why |
| --- | --- |
| One token layer (`tokens.css`) | Tokens were previously declared four times, so the look could only be changed by stacking `!important`. There is now no override layer. |
| A theme per designation | Each of the twenty designations carries its own accent, applied through the brand tokens, so navigation, buttons, badges, focus rings and chart series all shift with the role. |
| A computed chart palette | Dashboard series colours are a seven-slot cool categorical palette generated in OKLCH and checked with a validator, not chosen by eye: colour-blind separation dE 17.8 light / 12.8 dark against a target of 8, normal-vision separation 18.3 / 15.3 against a floor of 15, and every slot at or above 3:1 contrast on its surface. Slots are assigned in fixed order and never cycled; an eighth series folds into one neutral rather than reusing slot 1. |
| Status colours are reserved | Charts previously drew series identity from `--nx-success`, `--nx-warning` and `--nx-danger`, so a status colour could read as "series 3". Status now has its own chart tokens, used only where a figure genuinely means good or bad, and always with an icon or label. |
| Ordered stages get a ramp | Funnel stages are ordinal, not categorical, so they take a single-hue azure ramp where the colour carries the order. Scatter marks take one slot: every pair of marks can sit side by side there, and no cool seven-slot palette clears that stricter floor, so the fix is fewer colours rather than a re-stepped palette. |
| A cool, restrained palette | Every designation hue falls between 155 and 278 degrees - cool greens, teals, azures, indigos, violets and blue-greys. No warm accent anywhere. Saturation and lightness are capped so the set reads decent rather than bright. |
| Families separate on weight, not just hue | Twenty hues inside 120 degrees cannot separate on hue alone, so each family also has its own lightness/saturation regime: Finance deep and saturated, Supply chain light and muted, Commercial deep azure, Procurement light slate, Governance near-neutral. Related desks look related; unrelated ones read apart. |
| Type floored at 11px, ten sizes | Table headers were 8px and 484 declarations sat at or below 12px. Below 11px, uppercase text stops being readable and the interface reads as a mockup. |
| Serif display type | Page, hero and document titles are set in Source Serif; the working interface stays in the grotesque. This is what shifts the register from "dashboard" to "institution". |
| Tabular figures everywhere | Set on the prototype root, with numeric columns right-aligned through both `.amount` and `.nx-num`. Columns of digits that do not align are the loudest signal that software is not real. |
| Flat fills, no decorative gradients | 52 gradients were removed. Classic enterprise surfaces are flat with hairline rules. |
| Radii of 2-6px; pills only for status | Seven radii clustered at 6-12px read as consumer software. |
| Hairline elevation | Shadow blurs ran to 190px. Depth now comes from rules and spacing; the largest blur is 32px and only overlays use it. |
| One deep, desaturated brand | A single institutional navy, with saturation reserved strictly for state. |
| Three font weights | Fourteen weights were in use, the most common being 850. |

## Prototype structure

| Path | Purpose |
| --- | --- |
| `app/tokens.css` | **The only** file that defines `--nx-*` design tokens (light, dark, compact, print, responsive geometry, and the twenty designation themes) |
| `app/prototype-data.ts` | Authoritative 35-module navigation and screen catalogue |
| `app/mock-data.ts` | Static, invented cross-module fixtures and company/role variants |
| `app/prototype-shell.tsx` | Navigation, search, filters, routing, dialogs, toasts, export, and responsive shell |
| `app/prototype-content.tsx` | Reusable page archetypes and visual action surfaces |
| `app/role-dashboard-data.ts` / `-visual-data.ts` / `-analytics-data.ts` | Role dashboard KPI, chart, and analytics fixtures |
| `app/extended-role-experience.ts` | Dashboard fixtures for the eleven non-core roles, merged into the three registries above |
| `app/module-profiles.ts` | Registry of matured modules; a module listed here stops using generic archetypes |
| `app/module-banking-data.ts` / `app/module-finance-data.ts` | The two matured module profiles (Banking, Finance & Accounting) |
| `app/document-data.ts` / `app/document-template.tsx` | Printable A4 documents: invoice, purchase order, statement, journal voucher |
| `app/record-provenance.tsx` | Created / modified / source / numbering / trail strip shown on detail records |
| `app/drill/` | The recursive drill engine. `drill-renderer.tsx` is **the one renderer**; `registry.ts` is where a module registers a fact view and a dimension chain; `views/` holds the fact rows |
| `app/globals.css` / `app/prototype-extra.css` | Isolated prototype design system and responsive styles |
| `app/print.css` | Print medium rules; documents print without screen chrome |
| `tests/rendered-html.test.mjs` | Render, catalogue, and isolation checks |
| `tests/design-system.test.mjs` | Single token layer, 11px type floor, flat surfaces, classic radii |
| `tests/accessibility.test.mjs` | axe-core run plus landmark and accessible-name checks |
| `tests/finance-and-documents.test.mjs` | Double-entry integrity and amount-in-words correctness |
| `tests/drill-engine.test.mjs` | One-renderer rule, fact-row shape, sums by construction, dimension whitelist, URL round-trip, every required edge case |
| `tests/chart-palette.test.mjs` | Pins the validated palette values, forbids status-as-series, forbids slot cycling, and holds the ordinal/scatter rules |
| `tests/dashboard-period.test.mjs` | Period arithmetic (ISO weeks, leap years, month-end clamping), preset anchors, partial periods, value round-tripping, and the dashboard wiring |
| `.openai/hosting.json` | Dedicated prototype hosting configuration |

## Review guidance

Start at the Executive Command Centre, use global search to jump to a familiar workflow (for example, Invoice Detail, PO Approval, Nominals, Section Management, Production Orders, or Leave Approval), then compare Service and Manufacturing menu variants. Review both happy-path and Loading/Empty/Error states before approving layout patterns for later implementation.

Approval of this visual prototype does not approve backend behaviour, accounting rules, security controls, data migration, or production readiness; those require separate functional and technical implementation.
