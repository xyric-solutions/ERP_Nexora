# Nexora ERP Feature Inventory

**Snapshot:** 22 October 2026  
**Catalogue authority:** `PROTOTYPE-INVENTORY.md` and `app/shell/config/prototype-data.ts`  
**Implementation authority:** Current TypeScript API composition, contracts, migrations, connected UI and tests

## Inventory rules

- A catalogue screen is a purposeful prototype specification, not proof of persistence.
- **Live** means a current web/API/PostgreSQL path exists for the stated subset.
- **Partial** means only the named subset is live.
- **Prototype** means interactive fixture-based UI.
- **Planned** means requirements/design exist without current implementation.

## Feature inventory by module

| No. | Module | Principal features found | Main users | Inputs and outputs | Status and evidence | Limitations and recommended improvement |
|---:|---|---|---|---|---|---|
| 1 | Dashboard / Overview | 19 role dashboards, date comparison, KPI cards, alerts, action queues, drill journeys | Executives and functional managers | Fixture KPIs and derived mock periods; navigation to detail | **Partial / prototype.** Dashboard and drill source under `app/features/dashboard` and `app/features/drill` | No general live KPI service. Define KPI dictionary, freshness and source reconciliation |
| 2 | Banking & Treasury | Account balances/setup, Payments, Receipts, transfers, statement, reconciliation, cheques, treasury | Treasury, Finance makers/checkers/posters | Live Bank accounts and Payment/Receipt/Transfer lines, workflow context, approval and journal links | **Partial live.** `/api/v1/banking`; Finance migrations through 0026; live Bank UI and disposable-database lifecycle/security tests | Statement import/matching/reconciliation, external release and broader treasury remain prototype |
| 3 | Sales & Billing | Quotations, orders, fulfilment, invoices, notes, returns, pricing, approvals | Sales, fulfilment, Finance | Prototype commercial documents and fixture rows | **Prototype / planned.** Commerce workspace and blueprint | Build customer/order/invoice/AR/accounting vertical slice |
| 4 | Revenue & Subscriptions | Contracts, obligations, schedules, recognition, subscriptions, usage, recurring billing, dunning | Finance, commercial operations | Prototype contract/schedule data | **Prototype / planned** | Approve revenue policy, evidence, proration, modification and metric definitions |
| 5 | Customers / AR | Customer master, credit, open items, receipts, allocation, collections, ageing, statements | AR, Credit Control, Sales | Prototype customer/receipt data | **Prototype / planned** | Build customer master, AR subledger, credit and allocation rules |
| 6 | Purchases & Procurement | Requisitions, RFQ, evaluation, PO, receipt, inspection, bills, match, returns | Procurement, warehouse, AP | Prototype documents; historical reference designs | **Prototype / planned in current TS runtime** | Revalidate legacy claims; implement requisition-to-receipt-to-bill path |
| 7 | Suppliers / AP | Supplier/KYC/bank verification, bills, open items, holds, proposals, ageing | Procurement, AP, Treasury | Prototype supplier/payable data | **Prototype / planned** | Define KYC, duplicate checks, withholding, matching and payment selection |
| 8 | Inventory & Warehousing | Item/warehouse masters, stock, reservations, pick/pack, issues, transfers, counts, traceability, valuation | Inventory and warehouse users | Prototype stock/valuation data | **Prototype / planned in current TS runtime** | Approve valuation, negative stock, batch/serial and WMS depth |
| 9 | Costing & Landed Cost | Cost policies, landed-cost capture/allocation, item cost, standard cost, variance | Cost accountants, supply chain | Prototype allocation and cost data | **Prototype / planned** | Define eligible cost, allocation and cost-layer policy |
| 10 | Finance & Accounting | CoA, templates, hierarchy, nominals, fiscal periods, currencies/rates, journals, GL, close, reports, audit | CFO, Finance manager, accountant, auditor | Live master/period/currency data, Transfer FX policy and Banking postings; fixture journal/report screens | **Partial live.** `/api/v1/finance`, Currency Master, chart-template and fiscal-calendar routes; Finance migrations | Complete general journal, GL, TB, statements and close orchestration |
| 11 | Taxation & Compliance | Jurisdictions, registrations, codes, preview, exceptions, returns, evidence | Tax and Finance | Prototype tax data; localization design/migrations | **Prototype / unverified live scope** | Approve jurisdictions, tax authority and filing/integration scope |
| 12 | Operations | Daily board, work orders, dispatch, checklist, completion, incidents, handover | Operations and site managers | Prototype work-order data | **Prototype / planned** | Define target industry and operational objects before implementation |
| 13 | Production / Manufacturing | BOM, revisions, routing, MRP, capacity, production orders, WIP, completion, scrap, variance | Production, planning, costing | Mature prototype BOM/MO workspace | **Prototype / planned** | Approve manufacturing model, costing, quality and inventory dependencies |
| 14 | Quality Management | Plans/specifications, inspections, quarantine, nonconformance, CAPA, supplier quality, recall | Quality and operations | Prototype inspection/CAPA data | **Prototype / planned** | Define mandatory quality gates and genealogy |
| 15 | CRM | Accounts/contacts, leads, opportunities, activities, forecast | Sales/CRM | Prototype pipeline data | **Prototype / planned** | Define CRM ownership versus customer and Sales masters |
| 16 | Projects & Professional Services | Portfolio, setup, WBS, budget, delivery, time/expense, billing, WIP, profitability | Project managers, Finance | Live company project reference master; other data fixture-based | **Partial foundation.** `/api/v1/master_data/projects` | Build project contract, transaction and accounting domain |
| 17 | Resource Management | Skill profiles, capacity, allocation, bench, utilization, demand | Resource and project managers | Prototype resource/capacity data | **Prototype / planned** | Define calendars, skills, allocation workflow and KPIs |
| 18 | Helpdesk / Support / AMC | Tickets, SLA, knowledge, contracts, entitlements, renewals | Support and account teams | Prototype ticket/contract data | **Prototype / planned** | Decide support product scope and customer-portal relationship |
| 19 | HR & Payroll | Organization, employee, recruitment, attendance, leave, payroll, performance, learning, lifecycle, self-service, reporting | HR, payroll, managers, employees | Live selected employee/lifecycle records; fixture payroll and broader HR screens | **Partial live.** `/api/v1/hr`, HR migrations through 0034, connected pages listed in HR plan | Finish audit view, attendance, leave, payroll, payment handoff and UAT |
| 20 | Fixed Assets & Leases | Asset classes/register, acquisition, capitalization, transfer, depreciation, revaluation, disposal, leases | Finance, asset custodians | Prototype asset data | **Prototype / planned** | Approve capitalization, depreciation, custody and lease policy |
| 21 | Expense Management | Policies, claims, receipt/OCR, mileage, cards, advances, approval, reimbursement | Employees, managers, Finance | Prototype claims and receipts | **Prototype / planned** | Define evidence, duplicate detection, tax and settlement integration |
| 22 | Document Management | Library, upload/classify/link, versions, templates, sharing, retention, legal hold, expiry | All modules, compliance | Private S3 foundation; no live business metadata flow | **Partial infrastructure** | Implement metadata, authorization, scanning, retention and evidence links |
| 23 | Budget & Planning | Scenarios, models, dimension entry, import/spread, workflow, forecast, commitment and variance | Finance and department managers | Prototype planning data | **Prototype / planned** | Approve dimensions, commitment stage and version policy |
| 24 | Reports & Analytics | Catalogue/runner/viewer/drill, executive and module reports, schedules and metric definitions | Executives, managers, auditors | Mostly fixture data; selected live directories/history | **Partial / prototype** | Build governed read models, asynchronous exports and reconciliation |
| 25 | Portals | Customer invoices/payments/disputes, supplier RFQ/PO/payment, employee HR self-service | External parties and employees | Prototype portal data | **Prototype / planned** | Define external identity, isolation, consent and transaction limits |
| 26 | Administration & Multi-Tenancy | Tenant/company, users, roles, assignments, access review, delegation, impersonation, policy, audit | Tenant administrators and security reviewers | Live identity/security data | **Partial live; Identity is strong.** `/api/v1/security`, migrations 0001–0016 | Finish browser acceptance, broader tenant/company administration and operations |
| 27 | System Configuration & Extensibility | Company/fiscal/currency, sequences, dimensions, custom fields, rules, flags, form/view configuration | Administrators | Live fiscal calendar, governed 20-currency catalog/adoption/rates and limited masters; other pages fixtures | **Partial live** | Assign production ownership and complete remaining configurable masters, rules and impact analysis |
| 28 | Workflow / Approvals / SoD | My approvals, definitions, matrix, thresholds, delegation, escalation, monitor, audit | Makers, approvers, administrators | Embedded live domain workflows plus prototype generic workspace | **Partial live** | Avoid a generic engine that bypasses domain validation; add monitor/read model |
| 29 | Notifications | Inbox, preferences, templates, events, channels, delivery and retry | All users, administrators | Prototype notification data | **Prototype / planned** | Select channels and build idempotent delivery/retry evidence |
| 30 | Integrations | Catalogue, connections, clients/scopes, webhooks, mapping, runs, errors, retries, rotation, rate limits | Integration admins and operators | API/storage/queue foundation only | **Partial infrastructure** | Choose first integration, secret boundary and reconciliation model |
| 31 | AI Assistant | Contextual assistant, extraction review, explanation/forecast, human approval, policy, evaluation and audit | Knowledge workers and reviewers | Client-side mock AI engine/fixtures | **Prototype / planned** | Approve use cases, provider, privacy, retrieval, evaluation and human accountability |
| 32 | Audit & Compliance | Audit dashboard/explorer, transaction/session/access/master history, evidence packs, holds and exceptions | Internal/external audit, compliance | Live domain audit records; generic workspace prototype | **Partial live foundation** | Create unified, permissioned evidence read model and retention/export controls |
| 33 | Data Migration & Cutover | Projects, templates, mapping, dry run, correction, monitor, reconciliation, sign-off, rollback, hypercare | Data migration and business owners | Schema/catalog import scripts and prototype workspace | **Partial tooling / prototype** | Define customer-data migration, exception ownership and cutover rehearsal |
| 34 | Mobile | Approvals, barcode/QR, stock, expense, timesheet, leave, field service, offline/security | Mobile workforce | Prototype screens | **Planned** | Define short-lived tokens, secure storage, device policy and conflict rules |
| 35 | Fleet Management | Vehicles/drivers, assignment, dispatch, trips, fuel, maintenance, components, compliance, incidents, cost/reports | Fleet managers, drivers, Finance | Mature prototype workspace | **Prototype / planned** | Confirm commercial priority and integrations before implementation |

## Cross-cutting live feature inventory

| Feature family | Live subset | Key rules | Evidence |
|---|---|---|---|
| Authentication | Login, tenant selection, initial password change, session, rotate, logout/all | Generic denial, throttling, secure cookie, Redis session | Auth router, auth package and tests |
| Authorization | Exact permissions, role policies, assignments, access review, delegation, impersonation, session policy | Deny by default, RLS, SoD, last admin, revocation | Security router/repository, migrations, tests |
| HR lifecycle | Employee draft, profile, contacts, assignments, hire/movements/history | Company scope, effective dates, maker-checker, restricted projection | HR router/repository, UI and tests |
| Banking | Account master, Payment/Receipt lifecycle and posting | Version, idempotency, assigned approver, open period, linked reversal | Banking router/repositories, Finance posting and tests |
| Finance setup | CoA hierarchy/nominals/templates/adoption and fiscal calendar/period | Protected accounts, explicit classification, locks and audit | Finance/master-data routers and migrations |
| Platform | Health, readiness, OpenAPI, protected metrics, logging/tracing | Safe failures, no sensitive telemetry | API app, observability package and tests |
| Worker | Sample durable job | Deterministic ID, retry/dead-letter status | Jobs router and worker sample |

## Known inventory inconsistencies

- `PROTOTYPE-INVENTORY.md` states three Coming Soon screens at the top and later refers to five; the visible current list marks three Migration/Mobile entries. The manifest should be regenerated and reviewed.
- `README.md` contains older path references and narrower claims that no longer reflect current Banking, HR and Finance production slices.
- Historical production documents refer to a Python/FastAPI repository. Current runtime authority is the TypeScript monorepo under `app`, `server`, and `packages`.
- Migration existence does not prove the corresponding service is active; HR Payroll is the clearest example.
