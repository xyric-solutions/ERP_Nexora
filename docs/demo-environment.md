# Nexora Demo Company Environment

Status: PostgreSQL HR/Payroll candidate is ready for owner manual acceptance;
legacy Demo remains a rollback/reference only.

## D02-A production-composed candidate

The active modernization candidate uses the real production composition and
authorities:

```text
Nexora frontend (candidate localhost:3001)
  -> scripts/production_demo_server.py (create_production_application)
  -> PostgreSQL 18 nexora_demo_v2 (127.0.0.1:55434)
  -> Redis (127.0.0.1:56379)
```

It applies the production migration chain, uses separate non-superuser
migration/runtime roles, real password sessions, company-scoped RBAC, forced
RLS, production audit/idempotency, and deterministic seed data through the
existing Platform, Security, Workflow, Finance and HR authorities. The HR seed
includes Employee -> relationship -> lifecycle -> authoritative assignment ->
organization/work location -> EmploymentContextProvider. It now also contains
a controlled synthetic multi-employee October 2026 Payroll run covering
compensation, attendance, Leave, three OT categories, the approved Pakistan
TY2027 pack, Finance approval/posting, released payslip, governed payment
export and reconciliation. September 2026 remains protected history.

Use `.env.demo-production.example`, `compose.demo-production.yaml`, and the
production Demo scripts. Full commands and role boundaries are in
`docs/production-deployment-runbook.md`; exact verification is in
`docs/evidence/HR-DEMO-verification.txt`.

Build and start the candidate frontend with the candidate-safe scripts so the
browser bundle is compiled against the PostgreSQL Demo API rather than the
legacy rollback API:

```powershell
cd web
npm run build:demo
npm run start:demo
```

The scripts fail closed unless the API is `http://127.0.0.1:8001` and bind the
frontend to `http://localhost:3001`.

### HR/Payroll manual acceptance entry point

- Frontend: `http://localhost:3001/login`
- API: `http://127.0.0.1:8001`
- Tenant: `nexora-demo`
- Company: Nexora Demo Company
- Recommended login: `demo.admin`
- Development-only password: `NexoraDemo!2026`
- Role checks: `demo.hr`, `demo.finance.manager`, `demo.accountant`
- Completed scenario: October 2026 Payroll run 1
- Protected history: September 2026 Payroll run 1

`python scripts/production_demo_environment.py seed` is an idempotent
repair/reseed operation; it does not reset or rewrite sealed Payroll evidence.
Use `python scripts/production_demo_environment.py verify` before testing.

D02-B still owns Procurement/Inventory/Operations parity. Unsupported Sales,
AR/customer, Manufacturing and other absent authorities remain unavailable.
The legacy environment described below is retained unchanged for rollback and
comparison until the later cutover gate.

## Legacy Demo rollback/reference

## Purpose and boundary

The Nexora Demo Company is a controlled, resettable environment for product
demonstrations, QA, training, acceptance testing, and end-to-end development.
It uses the real Nexora API, repositories, posting engine, reporting service,
authorization policies, audit chain, and frontend.

It is never production evidence and never shares a database with development
or customer tenants.

```text
Same Nexora UI
      |
      v
scripts/demo_server.py (real ASGI application)
      |
      v
PostgreSQL database from NEXORA_DEMO_DATABASE_DSN
      |
      +-- marker: NEXORA_DEMO_ENVIRONMENT_ONLY
      +-- tenant: nexora-demo
      +-- company: nexora-demo-company
      +-- no other tenant is permitted by verification
```

The demo database is provisioned separately from the primary development
database. The generated credential manifest is under `var/demo/`, which is
ignored by Git. The source tree contains no generated bearer tokens or
production passwords; the one documented demo password is explicitly
development-only.

## Commands

Run from the repository root:

```powershell
docker compose up -d postgres
$env:NEXORA_DEMO_DATABASE_DSN = "postgresql://nexora:nexora@localhost:5432/nexora_demo"
python scripts/demo_environment.py reset
python scripts/demo_environment.py seed
python scripts/demo_environment.py verify
python scripts/demo_environment.py credentials
```

`reset` refuses to touch a PostgreSQL schema unless its internal marker,
tenant ID, company ID, and seed version all match the demo contract. It then
recreates only that marked schema and removes its generated credential file.

`seed` is idempotent. An empty PostgreSQL schema is migrated, seeded, and fully
verified in a transaction. An existing positively marked version-2 Demo
schema is additively upgraded to version 3 with the reference Chart of
Accounts, then verified; rerunning the current seed makes no duplicate
records. An existing unmarked schema is never overwritten.

`verify` checks:

- the database contains exactly the demo tenant;
- required company, organization, user, role, period, CoA, party, bank, tax,
  budget, recurring, AccountingEvent, journal, item, bin, procurement-document,
  and stock-ledger data exists;
- every seeded journal has equal base debit and credit;
- Trial Balance and Balance Sheet variances are zero;
- Cash Flow reconciles to the actual cash change;
- Budget vs Actual has approved budget rows;
- the AccountingEvent-to-journal source chain exists;
- the posted receipt-to-AccountingEvent-to-journal-to-stock chain reconciles;
- on-hand quantity and inventory valuation equal the immutable stock ledger;
- the append-only audit hash chain verifies;
- capability flags distinguish implemented cores from unimplemented modules.

## Running the demo

Backend terminal:

```powershell
python scripts/demo_server.py
```

Frontend terminal:

```powershell
cd web
npm run dev:demo
```

Open `http://localhost:3000/login`.

The demo frontend is the normal Nexora frontend. Demo mode only supplies safe
tenant/company defaults and renders a persistent amber banner:

`DEMO ENVIRONMENT — Nexora Demo Company — non-production data can be reset at any time`

The Finance company context defaults to `nexora-demo-company` but remains a
normal editable company selector.

Sign in through the normal credential form:

- Tenant ID: `nexora-demo`
- Username: `demo.admin`
- Password: `NexoraDemo!2026`

The password is a documented development-only seed setting. The database
stores only a salted PBKDF2-HMAC-SHA256 verifier. Successful login returns a
short-lived signed bearer session to the frontend and loads permissions from
the user's assigned backend role; users never copy or select either manually.

## Generated credentials

The seed creates nine role users:

| Username | Backend role | Current access |
|---|---|---|
| `demo.admin` | `demo_admin` | All currently defined Platform, Finance, Procurement, and Inventory permissions |
| `demo.accountant` | `demo_accountant` | Accounts, events, journals, recurring journals, and reports |
| `demo.finance.manager` | `demo_finance_manager` | Finance administration plus Procurement approvals |
| `demo.sales` | `demo_sales` | Platform read only; Sales is not implemented |
| `demo.purchase` | `demo_purchase` | Vendors, procurement documents, receipts, and operations reads |
| `demo.inventory` | `demo_inventory` | Item/bin administration and stock reads |
| `demo.project.manager` | `demo_project_manager` | Platform read only; Projects are not implemented |
| `demo.hr` | `demo_hr` | HR, employee, attendance, Leave, overtime and Payroll operations within company scope |
| `demo.viewer` | `demo_viewer` | Read-only finance and audit reports |

All nine seeded usernames use the same development-only demo password so role
behavior can be tested through the real login endpoint. The ignored
`var/demo/credentials.json` token manifest remains only for legacy API-test
compatibility; it is not part of the UI login flow and never needs to be
opened. Resetting the demo rebuilds password verifiers and rotates legacy
tokens.

## Seeded master data

The deterministic seed currently creates:

- Nexora Demo Company, one branch, seven departments, and one active warehouse;
- fiscal year 2026 and twelve monthly financial periods;
- USD, PKR, EUR, and GBP catalog support plus three effective exchange rates;
- nine users, nine role policies, and exact permission assignments;
- Finance, Reporting, Procurement, and Inventory enabled; future modules explicitly disabled;
- 367 CoA rows: 52 stable operational accounts plus a screenshot-derived
  reference hierarchy of 14 account groups, 78 sections, and 223 nominals;
- system-controlled Inventory and GRNI operational accounts remain unchanged;
- operating and savings bank accounts plus a petty-cash nominal account;
- three customers and three suppliers as real Party records;
- sales-tax and withholding-tax rules using the existing Pakistan reference
  tax pack;
- three approved budgets and a monthly rent recurring-journal template;
- department, cost-centre, and project dimension values on finance lines;
- two inventory items, two warehouse bins, and tracked batch data.

Project, Employee, HR, Sales subledger, and Cost Centre master modules remain
unimplemented. The seed does not invent them. Procurement and Inventory are
explicitly core scope: RFQ, vendor invoicing/AP subledger, transfers, cycle
counts, handheld scanning, and stock adjustments remain roadmap work.

## Seeded finance scenarios

Every scenario is posted through `PostingService`; dashboard and reports read
the resulting transactions rather than hardcoded totals.

- opening bank and petty-cash balances against share capital;
- manual office-supplies expense paid from bank;
- a finance-only sales-invoice accounting scenario with AR, revenue, and tax;
- a finance-only purchase-invoice accounting scenario with expense, input tax,
  and AP;
- customer receipt and supplier payment accounting scenarios;
- petty-cash and bank-charge transactions;
- withholding-tax contractor transaction;
- payroll accrual and payment accounting scenarios;
- multi-month consulting and SaaS invoice/receipt accounting scenarios;
- a generated and posted recurring rent cycle;
- approved revenue, rent, and hosting budgets.

One seeded transaction proves the complete implemented chain:

```text
Demo finance transaction
  -> AccountingEvent
  -> PostingService
  -> posted JournalEntry
  -> account General Ledger rows
  -> Trial Balance / financial reports
  -> audit evidence
```

A second operational transaction proves:

```text
Requisition -> approved Purchase Order -> approved Goods Receipt
  -> AccountingEvent -> PostingService -> balanced Inventory/GRNI journal
  -> immutable stock movement -> on-hand quantity and valuation
  -> approved receipt/invoice match -> audit evidence
```

The sales-, purchase-, receipt-, payment-, and payroll-named records are
explicit accounting scenarios. They are not Sales, Procurement, AR/AP, or HR
subledger documents.

## Reports available from seeded transactions

Implemented and meaningful:

- Trial Balance;
- General Ledger and AccountingEvent drill-down;
- Balance Sheet;
- Profit & Loss;
- Cash Flow;
- Budget vs Actual;
- finance dashboard;
- audit trail.

Not yet implemented and therefore not fabricated:

- AR Aging;
- AP Aging;
- Inventory Valuation;
- Sales Report;
- Purchase Report;
- standalone Tax Report;
- real sales, procurement, inventory, project, employee, payroll, or fixed-
  asset workflows.

Their existing product pages continue to show `Coming Soon` or structural
status.

## Acceptance coverage

`tests/e2e/test_demo_environment.py` verifies:

- username/password login, backend permission loading, issued-session use, and
  invalid-credential denial;
- company-scoped dashboard and account access;
- category/section/nominal CoA shape;
- backend rejection of an unbalanced journal;
- manual posting and reversal;
- General Ledger drill-down to an AccountingEvent source;
- Trial Balance equality;
- Budget vs Actual;
- audit visibility and hash-chain verification;
- read-only viewer permission denial for journal writes;
- truthful `not_yet_implemented` status for future modules;
- reset refusal against an unmarked/customer-like database.

This is an in-process API E2E smoke, not browser automation. Browser-level
login/navigation coverage should be added when a browser test runner becomes
an approved project dependency.
