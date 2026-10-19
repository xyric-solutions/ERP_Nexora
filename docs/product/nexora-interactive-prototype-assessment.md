# Nexora ERP Interactive Prototype — Repository Assessment (A–J)

- Date: 2026-08-31
- Status: submitted for owner review; implementation gate remains closed
- Scope: assessment and prototype planning only
- Implementation effect: none; no frontend, backend, API, database, accounting,
  Demo data, or production-RBAC code is changed by this document
- Input: `Nexora ERP — Interactive UI/UX Prototype — Master Implementation Brief`

## Executive position

Nexora does not need a frontend rewrite. It already has a sound Next.js shell,
an accessible responsive sidebar, backend-derived permission filtering, a
generated API client, a coherent design-token base, strong Finance surfaces,
and an isolated Demo environment. Those foundations should be retained.

The main gap is depth behind the menu. The live navigation contains 35 modules
and 589 nodes, but 127 routed nodes collapse onto 33 route strings and only 29
physical paths. Twenty-three of those paths are reused by multiple menu items;
`/inventory` alone represents 16 entries. The repository has 44 `page.tsx`
files (40 inside the authenticated shell), including 12 explicit Coming Soon
pages and 8 structural/partial pages. This is a credible implemented core, not
yet the complete clickable prototype described by the new brief.

The repository already contains a valuable 452-screen coverage register: 5
shared-entry screens, 402 module screen specifications, and 45 cross-module
journey screens. It should be promoted into the prototype page catalogue rather
than replaced, while its old breadth-first execution order remains superseded.

Recommended next action after written approval: refine and verify the existing
shell as Prototype Phase PUI-01, implement the reconciled master navigation and
prototype route registry as PUI-02, then stop for owner review exactly as the
brief requires.

## Source authority used for this assessment

| Source class | Treatment |
|---|---|
| Live `web/`, `app/`, contracts, tests, and Demo configuration | Active implementation truth |
| The new Interactive Prototype brief | Proposed authority for the prototype lane after written owner approval |
| Locked `vision.md`, `prd.md`, `architecture.md`, and `phase-plan.md` | Production intent, architecture, accounting, security, and delivery constraints |
| `docs/product/nexora-master-menu-responsive-sidebar.md` | Active navigation/shell contract, pending Demo acceptance |
| `docs/product/nexora-main-menu-architecture.md` and `nexora-main-menu-navigation.md` | Historical navigation records only |
| `docs/wireframes/screen-inventory.md` | Active coverage reference; its breadth-first execution order stays superseded |
| Master Functional Blueprint Part A | Detailed product authority for modules 01–11 only; Parts B/C are not written |
| `docs/design-system.md`, `docs/component-library.md`, `docs/ux-layouts-and-pages.md` | Active design intent, with documented stale implementation-status text |

Live implementation wins implementation-status ties. The new brief may govern
prototype presentation and interaction only; it cannot override Finance rules,
backend authorization, tenancy, audit, accounting invariants, or the locked
production build order.

## A. Existing frontend architecture

| Layer | Current implementation | Assessment |
|---|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript 5 | Reuse; matches ADR-18 |
| Styling | Tailwind CSS 4, shadcn/Radix primitives, semantic CSS variables, light/dark themes | Reuse and extend |
| Routing | App Router route group `(shell)` with nested Finance layout | Reuse; add meaningful prototype routes without breaking current paths |
| Application shell | Session guard → sidebar provider → responsive sidebar → sticky topbar → workspace → footer | Reuse; PUI-01 is refinement, not reconstruction |
| State/data | TanStack Query, generated OpenAPI types, `openapi-fetch`, session and Finance-company contexts | Reuse for real pages; isolate mock prototype state from live APIs |
| Forms | React Hook Form, Zod, shadcn fields in feature dialogs | Reuse; add shared ERP form compositions |
| Authentication/RBAC | Login creates a backend-issued tenant session; navigation consumes exact permission strings | Preserve unchanged for real functionality |
| Demo | Dedicated Demo environment, persistent warning banner, isolated seed/database | Reuse; add a visibly separate prototype-state layer only |
| Testing | Vitest, Testing Library, axe checks, lint, type/build, API drift, backend gates | Reuse and extend with route, interaction, viewport, and prototype-honesty tests |

The architecture is appropriate for the target. A parallel SPA, second design
system, hand-written API layer, or replacement shell would create unnecessary
risk and is not recommended.

## B. Existing components available for reuse

### Reuse substantially as-is

- `AppSidebar`, `Topbar`, `Breadcrumbs`, `PageContainer`, `PageHeader`,
  `AppFooter`, `UserMenu`, and `ThemeToggle`.
- `RequireSession`, `RequirePermission`, session provider, API provider, query
  provider, locale provider, and Finance company context.
- `DemoEnvironmentBanner`, `StructuralNotice`, and the honest
  `ComingSoonPage` disclosure pattern.
- shadcn/Radix Button, Card, Input, Select, Checkbox, Dialog, Dropdown, Popover,
  Sheet, Table, Tabs, Tooltip, Skeleton, Alert, Badge, Avatar, Breadcrumb,
  Textarea, Separator, and Toast primitives.
- Finance account tree/directory/detail/create components, report panels,
  drill-down sheet, journal dialogs, and Setup Draft components.

### Reuse but extend

| Component | Current strength | Required extension |
|---|---|---|
| `DataTable` | Shared loading, empty, row and table semantics | Search, filter bar, sorting, pagination, saved filters, column choice/resize, selection, bulk actions, export, responsive card mode |
| `StatusBadge` | One lifecycle status map | Keep lifecycle status separate from module maturity and prototype disclosure |
| `TrendChart` / `MiniBarChart` | Accessible fallback data and no extra dependency | Legends, periods, multi-series, tooltips, drill-down affordance, consistent currency/quantity formatting |
| Dashboard widgets | Live/placeholder honesty and reusable card shell | Executive layouts, role/company packs, freshness, alert/task/action centre |
| Confirm button/dialog patterns | Safe confirmation base | Standard approve, reject, return, cancel, reverse, match, reconcile, and close-period variants |
| Coming Soon / structural notices | Honest non-live disclosure | Add a distinct `Prototype only` page/action response instead of overloading Coming Soon |

### Add as shared prototype components

`PrototypeToolbar`, `PrototypeDisclosure`, `FilterBar`, `SearchBar`,
`ActionMenu`, `FormSection`, `FormField`, `DatePicker`, `SearchSelect`,
`MoneyField`, `LineItemTable`, `ApprovalTimeline`, `WorkflowStepper`,
`AuditTimeline`, `RecordActivity`, `EmptyState`, `LoadingState`, `ErrorState`,
and standard prototype-action feedback.

## C. Existing navigation structure

- One centralized typed tree in `nav-config.ts` drives labels, nesting, routes,
  icons, parent/module IDs, permissions, status, order, and company types.
- Current size: 35 modules, 589 nodes, 536 leaves, maximum depth 3.
- Module maturity: 2 Implemented, 13 Partial, 20 Coming Soon.
- Node maturity: 40 Implemented, 96 Partial, 32 Coming Soon, and 421 Not Yet
  Implemented.
- Only Sales, Purchases, and Reports currently reach three levels; the other 32
  modules stop at module → leaf.
- Implemented/Partial leaves are navigable after permission checks. Coming Soon
  and Not Yet Implemented entries are visible and disabled.
- Company type changes order/visibility through one master tree, but today it
  is selected by deployment environment, not an interactive prototype selector.
- Role variation is based on real backend permissions, not a prototype role
  preview. This is correct for production and must remain intact.
- Desktop expanded/collapsed, nested flyouts, mobile drawer, active ancestry,
  close-after-navigation, long-label truncation, and permission filtering are
  already implemented and tested.
- Route/page permission metadata is not fully aligned. Examples include a
  visible Finance link accepted by any Finance-read permission whose target
  page requires `finance.report.read`, a Period Reopening link whose page guard
  requires close permission, and Supplier/Inventory links whose umbrella pages
  require a different read permission. The Phase PUI-02 registry must make
  route-view permissions canonical and test navigation-to-page guard parity.

The navigation model is reusable, but its route/status semantics must be
extended deliberately for the prototype. The existing tests intentionally
forbid invented routes and require Coming Soon entries to remain disabled; PUI-02
will need an approved replacement contract rather than an accidental bypass.

## D. Existing pages

| Category | Current evidence | Assessment |
|---|---|---|
| Total App Router pages | 44 `page.tsx` files; 40 authenticated shell pages | Useful core, far below the 452-screen design inventory |
| Finance route files | 21 | Strongest domain, but not every Finance capability is live |
| Live/meaningful Finance | Dashboard, account hierarchy, Nominals, Sections, journal register/create/post/reverse, recurring templates/generation, GL, Trial Balance, P&L, Balance Sheet, Cash Flow, Budget vs Actual, periods, reports, bounded consolidation | Preserve behavior and APIs |
| Operations read surfaces | Procurement and Inventory over real Demo/API data | Reuse; workflows are only partial |
| Platform | Setup Drafts is live; login/session/profile and access guards exist | Reuse |
| Structural pages | 8 pages: organization, identity, workflow, notifications, audit, settings, profile, preferences | Useful shells, not complete management experiences |
| Coming Soon pages | 12 pages, including Sales/CRM, Projects, HR, Assets, AI, integrations, Banking, Tax, Budgets, AR/AP | Honest status, but not the required clickable prototype depth |
| Dashboard | Finance/setup live widgets plus clearly labelled placeholders | Partial, not the requested executive command centre |

There are no dynamic `[id]` route segments and no dedicated `/new` or `/edit`
route segments. List, detail, create, edit, approval, and report jobs therefore
cannot yet be navigated as the distinct pages required by the brief.

The brief's sentence “Finance is already implemented” must be read narrowly.
The Finance ledger/reporting core is real, but AR, AP, banking reconciliation,
tax operations, fixed assets, complete budget management, dimensions, FX
revaluation, full journal approval lifecycle, and close orchestration are not
complete end-to-end frontend capabilities.

## E. Existing design system

- Active specifications define semantic light/dark colors, typography, Lucide
  iconography, elevation, radius, 4 px spacing, Tailwind breakpoints, motion,
  density, responsive patterns, and WCAG 2.1 AA behavior.
- `globals.css` implements the principal light/dark semantic colors, sidebar
  tokens, chart colors, radius, Inter, and JetBrains Mono.
- The refreshed shell uses the intended dark navigation rail, restrained canvas,
  sticky header, coherent page headers, and responsive workspace containment.
- Shared shadcn/Radix primitives and visible focus/axe tests provide a credible
  accessibility baseline.
- The design reference screenshot should remain a quality benchmark only. Its
  brand, copy, business logic, and layout should not be copied.

Known design-system drift:

1. The brief requests `docs/design/`, but that directory does not exist; the
   equivalent active files are at `docs/design-system.md`,
   `docs/component-library.md`, and `docs/ux-layouts-and-pages.md`.
2. The component specification names TanStack Table, Recharts, dnd-kit, and
   cmdk, but none is installed. Current tables and charts are lighter custom
   implementations.
3. Some design documents still say major pages are “not started”; live code has
   overtaken that text. This is already recorded as finding BP1-F05.
4. Motion variables, full density switching, module accent tokens, complete
   responsive table transformations, and several specified composite components
   are not yet implemented consistently.

## F. Current gaps against the brief

| Gap | Current position | Required outcome |
|---|---|---|
| Distinct pages/routes | 589 nav nodes map to 29 physical paths | Meaningful list/detail/create/approval/report routes for every significant prototype page |
| Page inventory execution | 452 screen specs exist as coverage, not approved implementation | Promote to prototype catalogue; enrich page-level metadata before each module phase |
| Navigation composition | Combined Revenue; top-level Chart replaces separate Subscription module | Resolve owner conflict described in J-01 |
| Prototype status | No `Prototype only` navigation state | Add a separately styled, navigable, persistently disclosed state |
| Page archetypes | Implemented inconsistently by feature | Shared dashboard/list/detail/form/approval/workflow/report compositions |
| Enterprise tables | Basic shared table only | Required filters, saved views, sort, paging, columns, bulk actions, export, responsive behavior |
| Forms | Feature-specific dialogs; no full cross-module form system | Sectioned ERP forms, line items, money/date/search fields, validation and draft preservation |
| Workflows/approvals | Platform structural page and partial real workflows | Clickable prototype timelines, step navigation, all required decision dialogs and states |
| End-to-end journeys | Finance and partial procurement/inventory only | Clickable O2C, P2P, and Finance journeys with explicit prototype state |
| Executive dashboard | Finance/setup live plus placeholders | Role/company-aware prototype dashboard with all required KPIs/charts/drill-down affordances |
| Company mode | Build-time environment selection | Service/Trading/Manufacturing prototype selector isolated from tenant configuration |
| Role preview | Real session permissions only | Prototype role preview isolated from and never granting production permissions |
| Coherent demo data | Strong Finance plus partial procurement/inventory | One client-side prototype graph across sales, purchasing, projects, HR, assets, and manufacturing, clearly non-production |
| Interaction states | Present on selected real pages | Loading, empty, error, success, denial, confirmation, disabled, and prototype responses throughout |
| Responsive verification | Shell is responsive; not all page archetypes exist | Verify all requested widths and prevent page-level overflow |
| Accessibility verification | Strong component/shell baseline | Keyboard/focus/labels/contrast/axe checks for every new global pattern and critical journey |
| Blueprint depth | Detailed functional blueprint stops at module 11 | Do not invent policy in modules 12–35; expose assumptions/open questions during prototype review |
| Navigation/guard parity | Several link permissions do not equal target-page guards | One route registry and tests for menu visibility, page access, and action intersection |
| Keyboard table navigation | Shared clickable rows use mouse-only `<tr onClick>` behavior | Use real links/buttons or complete keyboard semantics before reuse as an enterprise grid |
| Motion/reduced motion | Transitions exist but no explicit reduced-motion implementation was found | Implement and verify the documented reduced-motion contract |

## G. Complete proposed prototype sitemap

Existing real routes stay valid. New prototype routes use the future-facing
canonical business paths below and carry persistent `Prototype only`
disclosure; they do not call unsupported production APIs.

| # | Module / route root | Principal child routes and page families |
|---:|---|---|
| 01 | Dashboard — `/dashboard` | executive, role dashboard, company-mode dashboard, KPI/alert drill-down |
| 02 | Banking & Treasury — `/banking` | accounts, balances, payments, receipts, transfers, statements/import, matching, reconciliation, revaluation, cheques/PDC, deposits, charges, interest, guarantees, letters-of-credit, cash, petty-cash, forecast, reports |
| 03 | Sales & Billing — `/sales` | quotations, orders, deliveries, returns, invoices (list/new/detail/credit/debit/batch/recurring/proforma), receipts (customer/advance/allocation/refund), customers, pricing, taxes, teams, salespeople, commissions, contracts, rate-cards, schedules, reports |
| 04 | Revenue Recognition — `/revenue` | contracts, obligations, allocation, evidence, schedules, runs, exceptions/holds, modifications, backlog, reconciliation, disclosures/reports |
| 05 | Subscription & Recurring Billing — `/subscriptions` | plans/versions, contracts, usage, amendments, billing schedules/runs, dunning, renewals/churn, metrics/reports |
| 06 | Customers / Accounts Receivable — `/customers` | profiles, onboarding, credit, open items, receipts, allocations, ageing, collections/disputes/dunning, statements, refunds/write-offs, reconciliation, reports |
| 07 | Purchases & Procurement — `/purchases` | requisitions/approval, RFQs, quotations, comparison/evaluation/award, orders/approval, gate inward, receipts, quality handoff, service/subcontract/import procurement, bills, match/exceptions, returns, reports |
| 08 | Suppliers / Accounts Payable — `/suppliers` | profiles/onboarding/KYC/bank verification, bills, open items, duplicate review, proposals, payment approval, advances/credits, holds/disputes, ageing/statements, reconciliation, reports |
| 09 | Inventory & Warehousing — `/inventory` | items/products/services/categories/UOM, warehouses/locations/bins, position/ledger, receipts/issues/transfers/returns/adjustments, reservations/pick/pack/dispatch/replenishment, counts, batch/serial/expiry/recall, valuation/revaluation, ageing/reorder/reports |
| 10 | Costing & Landed Cost — `/costing` | policies, shipments, charges, allocation/approval, item-cost history, FIFO/weighted average/standard/specific cost, production cost, variances, cost-to-GL reconciliation, reports |
| 11 | Finance & Accounting — `/finance` | accounts/categories/sections/nominals, journals/register/new/detail/approval/reversal/recurring, accounting events, GL, TB, P&L, BS, cash flow, budgets, periods/close, intercompany, consolidation, dimensions/cost/profit centres/projects, currency/rates/revaluation, audit, reports |
| 12 | Taxation & Compliance — `/tax` | jurisdictions/registrations, rules/codes/rates, withholding, transaction preview, exceptions, periods/returns, reconciliation, e-invoicing, certificates/evidence, reports |
| 13 | Operations — `/operations` | dashboard, work orders/job cards, dispatch/assignment, execution/checklists, delivery/acceptance, exceptions/incidents, shifts/handover, capacity/scheduling, costs/KPIs/reports |
| 14 | Production / Manufacturing — `/production` | product structure, BOM/versions, routings, work centres/machines, planning/MRP/material requirements, production orders/release, issue/WIP/completion, scrap/by-product/rework, subcontracting, capacity, costing/variance, maintenance, reports |
| 15 | Quality Management — `/quality` | plans/specifications, incoming/in-process/final inspections, queue/execution, quarantine/disposition, non-conformance, CAPA, supplier quality, complaints, traceability/recall, approvals/certificates, reports |
| 16 | CRM — `/crm` | dashboard, accounts/contacts, leads/sources/assignment/qualification, opportunities/pipeline, activities/calls/meetings/follow-ups, proposal handoff, forecast, campaigns/segments, reports |
| 17 | Projects & Professional Services — `/projects` | portfolio, setup/contracts/scope, WBS/milestones/tasks/delivery, team/resources, timesheets/expenses, budget/cost/revenue/WIP/profitability, T&M/milestone/fixed/retainer billing, changes/risks/close, reports |
| 18 | Resource Management & Utilisation — `/resources` | people/skills/rates, availability/capacity, allocation/request/approval, soft bookings, bench/utilisation, demand forecast, timesheet capacity, gaps/over-allocation, reports |
| 19 | Helpdesk / Support / AMC — `/support` | dashboard, tickets/assignment/workbench, SLA/escalation, contracts/AMC, entitlement consumption, renewals, knowledge, complaints/CSAT, reports |
| 20 | HR & Payroll — `/hr` | employees/records/org, recruitment/onboarding, attendance/shifts/leave/holidays/overtime, payroll setup/input/run/validation/approval/payslips, compensation/loans/benefits/statutory, performance/training, offboarding/settlement, ESS, reports |
| 21 | Fixed Assets & Leases — `/assets` | classes/policies, register/detail, acquisition/CWIP/capitalisation, transfer/assignment/tagging/verification, depreciation, revaluation/impairment, disposal, leases/schedules/payments, reports |
| 22 | Expense Management — `/expenses` | policy/categories, inbox/claims/editor, receipt/OCR, mileage/per-diem/travel, approval, corporate cards, advances/settlement, reimbursement/accounting, reports |
| 23 | Document Management — `/documents` | library, categories, detail/versions, upload/classify/link/attachments, templates/contracts/signatures, access/share, retention/legal hold, expiry/renewal, search/audit |
| 24 | Budget & Planning — `/planning` | scenarios, models, annual/department/project/cost-centre/revenue/expense/capital budgets, entry/import/spread, workflow/revisions, forecast/reforecast, commitments/availability, budget-v-actual/variance, reports |
| 25 | Reports & Analytics — `/reports` | catalogue, runner/viewer, finance/sales/purchase/inventory/production/project/HR/support/tax/audit/executive packs, drill-down, saved views/export, schedules/subscriptions, dashboard composer, metric/freshness/admin |
| 26 | Portals — `/portals` | customer home/invoices/payments/statements/disputes/support/projects; supplier RFQ/quotation/PO/receipt/invoice/payment; employee leave/attendance/expense/timesheet/payslip/documents; configuration |
| 27 | Administration & Multi-Tenancy — `/administration` | tenants/companies/branches/departments, users/detail/access, roles/permissions, assignments/reviews/delegation, sessions/security, fiscal/currency/tax/numbering, entitlements/module visibility, API keys/integrations/system settings, Demo/reset, audit |
| 28 | System Configuration & Extensibility — `/configuration` | configuration home, company/fiscal/currency, sequences, dimensions, custom fields, validation/default/business rules, module settings, localisation/language/RTL, feature flags/entitlements, forms/views/print/templates, workflow/report builder, versions/migration/impact/audit |
| 29 | Workflow / Approvals / SoD — `/workflows` | my/pending approvals, approval detail/history, definitions/designer, matrix, thresholds/routing simulation, sequential/parallel flow, SoD/maker-checker, delegation/escalation, monitor/failures, audit/reports |
| 30 | Notifications — `/notifications` | centre/detail, categories, read/unread, preferences/digests, templates, event/routing rules, delivery logs/retry, channels/escalations |
| 31 | Integrations — `/integrations` | catalogue/connections, banks/gateways/tax/email/SMS/storage/e-commerce/POS/BI, API clients/scopes, webhooks, mapping/test, runs/messages, errors/retry/DLQ, secret rotation, limits, monitoring/audit |
| 32 | AI Assistant — `/ai` | assistant/query history, source-aware responses, suggestion/review/approval handoff, extraction/explanation/forecast, automation catalogue, model/policy configuration, source/confidence, evaluation/feedback, usage/audit |
| 33 | Audit & Compliance — `/audit` | dashboard/explorer, event detail, transaction/master/login/session/permission/approval/period evidence, before/after history, compliance packs, control exceptions/fraud signals, retention/archive/legal hold |
| 34 | Data Migration & Cutover — `/migration` | projects/templates/objects, upload/profile, mapping, validation/dry run/errors, loads, reconciliation/sign-off, cutover/freeze, parallel run/rollback, hypercare |
| 35 | Mobile — `/mobile` | home, approvals, barcode/QR, receive/move/count, expenses, timesheets, leave/attendance, field service/delivery proof, customer/supplier lookup, notifications, offline/conflicts, security/settings |

Shared routes remain `/login`, `/profile`, `/preferences`, `/unauthorized`, and
`/forbidden`. Every record-oriented family uses predictable `/new` and `/:id`
variants where the list, create/edit, and detail jobs are materially distinct.
Existing real routes such as `/procurement`, `/admin/workflows`, `/audit-log`,
and `/finance/accounts/*` must remain available through direct compatibility or
safe redirects; route migration is not part of PUI-01.

## H. Complete module → submenu → page inventory

The repository already contains the complete permanent page-name register in
`docs/wireframes/screen-inventory.md`:

| Inventory scope | Count | Use in this prototype |
|---|---:|---|
| Shared entry/context | 5 screens | Sign-in, company/role selection, command centre, work/approvals, global search |
| Modules 01–35 | 402 screen specifications | Canonical module → functional group → page coverage |
| Cross-module journeys | 45 screens | P2P, O2C, service project-to-cash, plan-to-produce, R2R, HR, assets, subscription, governed decision trace |
| Total | 452 specifications across 88 batches | Traceability baseline, not a claim of implementation |

The exact page names and permanent IDs in that register are adopted by this
assessment without duplication. Section G adds the canonical route namespace
and submenu grouping that the coverage file intentionally lacks. Together,
Section G and the existing register form the complete proposed module → submenu
→ page inventory.

Before implementation of any page-bearing phase (PUI-04 onward), the relevant
inventory rows must be enriched with the brief's remaining page-level fields:
page archetype, primary action, lifecycle-valid secondary actions, required
shared components, final maturity status, and exact prototype route. This is a
per-phase design gate, not permission to invent unresolved accounting, tax,
payroll, manufacturing, security, or compliance policy.

## I. Recommended implementation phasing

Use `PUI-xx` identifiers so the prototype phases cannot be confused with the
locked production Phase 1–4 plan.

| Phase | Recommended execution |
|---|---|
| PUI-00 | Owner approves this assessment and resolves J. Freeze the prototype catalogue, status semantics, and route rules. |
| PUI-01 | Application shell: audit/polish the existing shell, responsive framework, theme, disclosure, and prototype toolbar; do not rebuild working shell behavior. Verify all requested widths. |
| PUI-02 | Master menu: implement the approved 35-module catalogue plus the Chart decision, full submenu tree, route registry, statuses, prototype role/company visibility, breadcrumbs, and mobile/collapsed behavior. **Stop for owner review.** |
| PUI-03 | Global page archetypes and components: enterprise table, filters, forms, money/line items, drawers/modals, status/action menus, approval/workflow/audit patterns, standard states. |
| PUI-04 | Executive dashboard and role/company-mode packs. |
| PUI-05 | Finance presentation, preserving every real API/accounting behavior and clearly separating prototype-only lifecycle steps. |
| PUI-06 | Banking & Treasury prototype. |
| PUI-07 | Sales, Billing, Customers, and AR prototype plus O2C journey. |
| PUI-08 | Purchases, Procurement, Suppliers, and AP prototype plus P2P journey. |
| PUI-09 | Inventory, Warehousing, Costing, and Landed Cost prototype. |
| PUI-10 | CRM, Projects, Resources, and Support prototype plus service project-to-cash journey. |
| PUI-11 | HR, Payroll, Assets, Leases, and Expenses prototype. |
| PUI-12 | Manufacturing, Production, Quality, and Operations prototype plus plan-to-produce journey. |
| PUI-13 | Reports, Administration, Configuration, Workflow, Notifications, Tax, Documents, Audit, Migration, and Cutover. |
| PUI-14 | AI, Integrations, Portals, and Mobile prototype. |

Each phase ends with relevant tests, lint/type/build, route checks, viewport
checks, accessibility checks, regression checks against existing real behavior,
a completed/limitations report, and an owner stop gate. Prototype-only pages
must use a client-side, referentially coherent dataset and never write to an
unsupported production API.

## J. Conflicts between the existing implementation and the brief

| Ref | Conflict | Recommended resolution |
|---|---|---|
| J-01 | The brief's 35 includes separate Revenue Recognition and Subscription modules and keeps Chart inside Finance. The live 35 combines Revenue/Subscriptions and uses the freed slot for the owner-approved top-level Chart. | Preserve Chart as an unnumbered pinned top-level workspace and implement all 35 catalogue modules, producing 35 modules plus 1 pinned workspace (36 visible roots). Owner approval required. |
| J-02 | Current tests explicitly lock Chart as top-level with Nominals and Section Management. Exact brief compliance would re-nest it. | Do not silently break the prior owner decision; use J-01 unless the owner explicitly reverses it. |
| J-03 | Live statuses are Implemented, Partial, Coming Soon, Not Yet Implemented. The brief adds Prototype only and says Not implemented. | Adopt five explicit prototype statuses. Only Implemented/Partial real routes and Prototype-only mock routes are navigable; Coming soon/Not implemented remain disabled. |
| J-04 | Current route contract forbids invented URLs and disables non-live items; the brief requires a complete clickable prototype. | Approve a separate prototype route/data contract. Prototype routes are meaningful and visibly non-production; production authorization remains authoritative on real routes. |
| J-05 | Current company type is deployment-configured, while the brief requires a selector. | Add a prototype-only selector in a visually distinct toolbar; never mutate tenant configuration. |
| J-06 | Current role variation uses real permissions, while the brief requires role previews without changing production RBAC. | Add a prototype role lens that affects prototype presentation only and cannot grant access to real protected routes/actions. |
| J-07 | The brief says Finance is already implemented; live evidence shows a strong but partial Finance product. | Preserve real Finance behavior and mark each missing workflow step Prototype only, Coming soon, or Not implemented at page/action level. |
| J-08 | The brief permits mock interaction but prohibits simulated production functionality. | Use deterministic client-side prototype state, a persistent disclosure, explicit prototype action responses, and no unsupported API writes/posting claims. |
| J-09 | The locked product phase plan has four production phases; the brief has fourteen prototype phases with overlapping numbers. | Namespace the new plan PUI-01…PUI-14; it does not reorder production segments. |
| J-10 | The locked PRD says every vertical module will not be completed in v1, while the brief asks for all-module coverage. | Treat breadth as interface prototype coverage only, not production delivery or module completion. |
| J-11 | Functional Blueprint detail stops after modules 01–11; modules 12–35 are coverage reservations. | Prototype IA and states may proceed from the approved brief, but unresolved business rules remain explicit assumptions/open questions. |
| J-12 | The expected `docs/design/` directory is absent; equivalent design files live at `docs/` root. | Reuse the active root documents now; normalize their location only as a separately approved documentation cleanup. |
| J-13 | Design docs specify advanced libraries/components that are not installed. | Prefer existing primitives first. Add dependencies only in PUI-03 when a demonstrated requirement cannot be met cleanly and record the dependency decision. |
| J-14 | Several current Partial navigation items open Coming Soon pages, while some report cards link to future pages that the sidebar disables. | Re-audit page-level maturity and link behavior in PUI-02; one canonical route/status registry must drive sidebar, cards, breadcrumbs, and page disclosure. |
| J-15 | Current Demo data is coherent mainly for Finance and partial procurement/inventory, not all requested journeys. | Add a separate prototype dataset graph; never relabel finance-only journals as implemented Sales, AR/AP, Projects, HR, or Manufacturing transactions. |
| J-16 | The shell has prior implementation/approval history, but the new brief restarts at Phase 1 after this assessment. | Treat PUI-01 as bounded verification and refinement of the existing shell, preserving accepted behavior and applying only approved deltas. |
| J-17 | Some menu permissions and target-page guards differ, so a visible link can end at Forbidden. | Centralize route-view permission requirements and make real action availability the intersection of prototype presentation and backend-issued permissions. |

## Recommended approval package

Approval should confirm all of the following:

1. The new brief governs the prototype UX lane; locked architecture and live
   code continue to govern production behavior and implementation truth.
2. Chart of Accounts remains a pinned top-level workspace with Nominals and
   Section Management, while the complete 35-module catalogue includes separate
   Revenue Recognition and Subscription & Recurring Billing modules.
3. `Prototype only` becomes a distinct navigable state; Coming soon and Not
   implemented remain disabled.
4. Prototype role/company switching is isolated from production RBAC and tenant
   configuration.
5. Canonical business routes may host clearly disclosed client-side prototype
   pages, with no unsupported backend, database, accounting, or RBAC changes.
6. The 14 delivery phases are named PUI-01…PUI-14 and do not replace the locked
   four-phase production plan.
7. After approval, work proceeds through PUI-01 and PUI-02 only, then stops for
   review.

Written approval is required before implementation starts.
