# HR & Payroll Production System Design

- Status: approved in conversation on 2026-10-06; written specification awaiting final file review
- Scope: complete Pakistan HR and Payroll lifecycle
- Product baseline: `prototype/`
- Production stack: Next.js, TypeScript, Node.js, Express.js, PostgreSQL
- Deployment: single customer, multiple companies and branches, Linux containers on cloud/VPS infrastructure
- Scale target: up to 5,000 employees
- Data migration: included

## 1. Decision authority and supersession

This specification records the product owner's decisions made after reviewing
the current prototype and the pasted HR lifecycle requirements. It supersedes
`docs/superpowers/specs/2026-10-06-hr-payroll-production-conversion-design.md`
where the two disagree. The superseded design assumed separate production
`app/`, `contracts/`, and `web/` authorities and required the prototype to stay
isolated. Those roots are not present in this workspace, and the owner has now
directed that the existing prototype be converted in place.

The following choices are fixed for this program:

1. Full HR and Payroll are in scope, including statutory calculations,
   payslips, payment handoff, final settlement, and Finance journal handoff.
2. The application is single-customer and multi-company, not shared-schema
   SaaS multi-tenancy.
3. Pakistan is the only release-one payroll jurisdiction.
4. The current prototype is the UX baseline and will be converted in place.
5. The frontend is a responsive Next.js web application. There is no native
   mobile application or PWA in release one.
6. The backend is a TypeScript modular monolith on Node.js and Express.js.
7. PostgreSQL is the system of record. Redis supports background jobs, and
   private S3-compatible storage holds documents and generated files.
8. Authentication uses local accounts with MFA.
9. Approvals are versioned and configurable.
10. Attendance supports manual entry, file import, and a vendor-neutral device
    adapter.
11. Payroll payment uses controlled bank-file export and confirmation import,
    not a live bank API.
12. Finance integration uses balanced, idempotent accounting events. Building
    a complete Finance ledger is outside this scope.

## 2. Goal and success condition

Convert the approved HR and Payroll prototype into a secure production system
that manages the complete employee lifecycle:

`PLAN -> RECRUIT -> SELECT -> HIRE -> ONBOARD -> CONFIRM -> MANAGE -> DEVELOP
-> MOVE/REWARD -> SEPARATE -> CLEAR -> SETTLE -> CLOSE`

The project is successful only when each approved workflow operates through
the Next.js interface, versioned Express API, backend domain rules,
PostgreSQL constraints and transactions, authorization, approval, audit,
tests, monitoring, and signed business UAT. A rendered screen or an in-memory
calculation alone does not count as completion.

## 3. Repository audit

### 3.1 Available implementation surface

The workspace contains `prototype/`, `docs/`, and `segments/`. The prototype
is a React/Vinext mock application with TypeScript fixtures and domain-like
calculation functions. The production roots referenced by older documents are
not available here. The new production system must therefore be created inside
the existing `prototype/` project boundary and migrate that project to standard
Next.js.

### 3.2 Current inventory

- Live catalogue: 35 modules, 146 groups, and 792 pages.
- HR catalogue: 11 groups and 67 pages.
- HR/Payroll reports: 45 report definitions.
- Dedicated prototype handlers:
  - 23 recruitment, performance, learning, and lifecycle pages;
  - 10 attendance/leave-configuration pages;
  - 9 payroll pages;
  - 6 HR reporting/control pages plus 45 report pages;
  - 6 HR master screens and the organization structure.
- Twelve HR pages still fall through to generic prototype rendering:
  Employee Directory, Add Employee, Employee Record, Positions & Organisation,
  Attendance, Leave Requests, Add Leave Request, Leave Approval, Payroll
  Inputs, Loans/Benefits/Gratuity, Statutory Deductions, and Employee
  Self-service.

### 3.3 Verification performed

| Check | Result |
|---|---|
| `npm.cmd test` in `prototype/` | Build passed; 158 of 160 tests passed |
| Catalogue/render tests | 2 failures: tests/docs expect 141 groups and 749 pages, while live source has 146 groups and 792 pages |
| `npm.cmd run lint` in `prototype/` | Failed with 3 existing unused-variable errors in `app/hr-reporting-data.ts` |
| Production persistence inspection | No Express API, PostgreSQL persistence, authentication, durable job processing, or real object-storage path exists |

### 3.4 Prototype strengths to preserve

The prototype already provides strong executable behavior specifications for:

- effective-dated assignments and employee status transitions;
- organization/master usage protection and historical retention;
- recruitment, interview evidence, offers, onboarding, probation, movements,
  separation, clearance, and final settlement concepts;
- raw attendance processing, shift precedence, cross-midnight shifts,
  corrections, overtime, leave balances, and attendance-period locking;
- performance scoring, calibration, training attendance, completion evidence,
  and controlled outcomes;
- parsed payroll formulas, effective-dated salary assignments, immutable closed
  payroll snapshots, approved-input-only processing, balanced journals, payment
  references, and arithmetic invariants;
- scoped HR reporting and auditable export concepts.

These functions and tests are characterization evidence. They stay in place
until equivalent production-domain and integration tests prove the replacement.

### 3.5 Production gaps

The current application has no durable database or API, no real identities or
MFA, no company-scoped authorization boundary, no persisted approval engine,
no field-value audit history, no object storage, no malware scanning, no
attendance-device integration, no bank adapter, no Finance consumer, no data
migration pipeline, and no operational recovery path. In-memory fixtures are
mutable build assets, not business records.

## 4. Scope

### 4.1 Included

- Platform security, local authentication, MFA, role/permission management,
  company/branch scopes, sessions, and segregation of duties.
- Configurable approvals, delegation, escalation, immutable approval actions,
  notifications, and audit history.
- Organization, position, and HR master data.
- Employee identity, contacts, bank/tax data, dependants, emergency contacts,
  documents, assignments, employment relationships, and status history.
- Manpower planning, recruitment, interviews, assessments, offers, hiring,
  onboarding, probation, and confirmation.
- Shifts, raw attendance, attendance processing, corrections, overtime,
  imports, period close, and payroll inputs.
- Leave types, policies, accruals, balances, requests, approvals, encashment or
  settlement inputs, and history.
- Performance cycles, goals, evaluations, calibration, improvement plans,
  outcomes, training requests, sessions, attendance, completion, and
  certificates.
- Promotions, transfers, movements, compensation revisions, loans, advances,
  benefits, and recoveries.
- Pakistan payroll configuration, gross-to-net calculation, tax, EOBI,
  provincial social-security rules, payroll review, approval, snapshots,
  payslips, bank files, payment confirmation, and accounting events.
- Resignation, termination, contract completion, retirement, notice,
  clearance, exit interview, final settlement, and closure.
- Employee/manager self-service, dashboards, 45 reports, secure export, and
  compliance evidence.
- Structured migration of existing employees, history, balances, compensation,
  loans, attendance openings, and documents.

### 4.2 Excluded from release one

- Shared-schema SaaS tenancy.
- Native mobile applications and installable PWA behavior.
- Microservices and service-owned databases.
- Live bank API integration.
- A complete Finance ledger, period-close, or payment system.
- Jurisdictions outside Pakistan.
- Unreviewed automatic interpretation of laws or hard-coded statutory rates.

## 5. Target architecture

The repository becomes an npm-workspace TypeScript system inside
`prototype/`:

```text
prototype/
  apps/
    web/          Next.js responsive web application
    api/          Express.js REST API
    worker/       Redis-backed background workers
  packages/
    contracts/    API schemas, OpenAPI types, shared identifiers
    db/           Drizzle schema, repositories, SQL migrations
    domain/       Framework-independent business rules and state machines
    auth/         Session, MFA, permissions, scope evaluation
    observability/logging, metrics, tracing conventions
    testing/      fixtures, factories, integration harnesses
```

This is a modular monolith. Each domain owns its application services,
repositories, routes, jobs, events, and tests. Modules may call another module
only through an exported application interface or domain event. They do not
write another module's tables.

The browser never accesses PostgreSQL, Redis, or S3 directly. The normal path
is:

`Next.js -> HTTPS REST API -> validation -> authentication/scope -> application
service -> PostgreSQL transaction -> audit/outbox -> response/query refresh`

Long-running imports, payroll calculations, report exports, document scanning,
and notifications are persisted jobs executed by workers. Job state is visible
in the UI and safe to retry.

## 6. Production modules and audit disposition

| ID | Module | Prototype evidence | Production outcome |
|---|---|---|---|
| M01 | Platform & Security | Role-selection concepts only | Local login, MFA, sessions, RBAC, field rules, company/branch scope, SoD |
| M02 | Workflow & Audit | Statuses and approval-shaped screens | Versioned definitions, instances, actions, delegation, escalation, field-value audit |
| M03 | Organisation | Organization tree and six mature master views | Multi-company hierarchy, sections/units, positions, all masters, usage protection |
| M04 | Employee Core | Strong in-memory employee, assignment, status, document model; four generic people screens | Production employee workspace, effective history, sensitive satellites, documents |
| M05 | Manpower Planning | Dedicated requisition fixtures/screens | Budgeted requisitions, vacancy authority, configurable approvals |
| M06 | Recruitment | Dedicated pipeline, interview, offer, conversion behavior | Candidate/application history, evidence, offer approval, atomic employee conversion |
| M07 | Hire, Onboard & Probation | Dedicated lifecycle fixtures/screens | Checklist templates/instances, access/assets tasks, probation decisions, confirmation |
| M08 | Manage & Develop | Strong performance/training fixtures and invariants | Cycles, goals, reviews, calibration, plans, training evidence and outcomes |
| M09 | Move & Reward | Movement and salary-revision concepts | Effective-dated promotion/transfer/change transactions and linked compensation |
| M10 | Separation & Settlement | Dedicated resignation, termination, clearance, settlement, offboarding views | Governed cases, departmental clearance, final inputs, approved closure |
| M11 | Time & Attendance | Strong processing logic and ten dedicated pages; generic legacy Attendance page | Immutable punches, imports/adapters, daily results, corrections, overtime, period lock |
| M12 | Leave | Balance logic exists; request and approval pages are generic | Policy/accrual engine, balance ledger, requests, approvals, attendance/payroll effects |
| M13 | Payroll & Statutory | Strong formula, salary, run, journal, payment invariants; some generic setup pages | Pakistan rule packs, deterministic jobs, exceptions, snapshots, payslips, compliance |
| M14 | Benefits & Loans | Loan calculations exist; benefits screen is generic | Eligibility, enrollment, schedules, approvals, payroll recovery, settlement |
| M15 | Payments & Finance | Prototype bank batch and balanced journal concepts | Bank adapters, maker-checker, confirmation import, accounting outbox/acknowledgement |
| M16 | Self-service | Generic employee self-service page | Employee and manager workspaces with scoped actions and document/payslip access |
| M17 | Reporting & Compliance | 45 reports and scoped/export concepts | Database-backed reports, background exports, dashboards, audit receipts, retention |
| M18 | Documents & Notifications | Metadata and UI concepts only | Private storage, checksums, scanning/quarantine, signed access, in-app/email notices |
| M19 | Migration & Operations | No production path | Staged migration, reconciliation, deployment, backup, restore, monitoring, cutover |

## 7. PostgreSQL data design

### 7.1 Identity and organization

Internal rows use UUID primary keys. Human-readable employee, requisition,
offer, payroll, settlement, and payment numbers use scoped database sequences
or locked numbering services. Company-owned records carry `company_id`; branch
or organization scope is added where narrower authorization is required.

The organization model uses a controlled hierarchy for company, branch,
department, and section/unit. Position is separate from designation: a
position is an approved seat in the organization, while a designation is a job
title/classification. Cost centre remains a Finance dimension rather than an
organization-tree level.

### 7.2 Employee authority and history

`employee` owns stable identity and lifecycle references. Sensitive data is
separated into contact, bank, tax, emergency-contact, dependent, and document
tables so permissions and audit can be applied precisely.

Organizational facts live in effective-dated `employee_assignment` rows, not
duplicated current-value columns on the employee. PostgreSQL exclusion
constraints prevent overlapping assignment periods for one employment
relationship. Status changes are append-only `employee_status_event` rows.

Promotions, transfers, confirmations, suspensions, salary revisions, and
separations are controlled transactions. Approval applies a new effective row
or status event atomically; it never rewrites old history.

### 7.3 Time and leave

Device and imported punches are immutable source observations with source IDs
and deduplication keys. Daily attendance is derived by a versioned processing
run. Corrections and overtime are separate approved transactions. A locked
attendance period is immutable except through an explicit reopen workflow.

Leave uses a ledger. Entitlements, accruals, carry-forward, adjustments,
approved usage, reversals, and settlement movements are individual entries.
The displayed balance is derived and reconciled; it is not a freely editable
number.

### 7.4 Compensation and payroll

Pay components, formulas, structures, salary assignments, tax rules,
contribution rules, and eligibility policies are versioned and effective-dated.
Formula text is parsed by a restricted expression engine and never executed as
JavaScript.

Money is stored as integer paisa in PostgreSQL `bigint`. APIs expose decimal
strings to avoid JavaScript floating-point and JSON integer precision errors.
Business dates use `date`; audit and integration events use `timestamptz`.

Payroll calculation persists an input fingerprint, per-employee result,
result items, warnings, and rule-version references. Approval freezes the
result. Closed runs are snapshots and are never recalculated from current
master data.

### 7.5 Workflow, audit, and integration

Workflow definitions are versioned. Submission captures a specific definition
version so changing company policy does not mutate an in-flight approval.
Every action records actor, role, step, action, time, comments, delegation, and
before/after state.

Audit events and sensitive field changes are append-only and written in the
same transaction as the business change. Outbox events are also committed in
that transaction. Consumers use inbox/idempotency records so retries cannot
duplicate Finance postings, notifications, imports, or confirmations.

## 8. API and application behavior

- Versioned REST endpoints use `/api/v1` and publish OpenAPI contracts.
- Boundary schemas validate params, queries, and bodies. Shared generated types
  prevent web/API contract drift.
- Registers use cursor pagination, bounded page sizes, indexed server filters,
  and stable ordering.
- Commands return the new record version. Stale updates fail with a conflict
  rather than overwriting newer changes.
- Sensitive commands accept an `Idempotency-Key`.
- Errors use a consistent problem shape with HTTP status, stable code, safe
  message, field errors, and correlation ID. Stack traces and secrets are
  never returned.
- Database work is transactional. Partial failure rolls back the business
  change, audit event, and outbox event together.
- Background failures are classified as retryable or terminal. Repeated
  failures move to operator review; they are not retried indefinitely.

## 9. Security and privacy

- Passwords use a current memory-hard password hash such as Argon2id with
  centrally managed parameters.
- MFA supports TOTP and single-use recovery codes. Recovery and MFA changes
  are separately authenticated and audited.
- Browser authentication uses secure, HTTP-only, same-site cookies, CSRF
  protection, session rotation, idle/absolute expiry, and server-side
  revocation.
- Permissions are action-specific and combined with company, branch,
  organization, employee-self, and manager-reporting scopes.
- Field rules protect CNIC, bank account, tax identifiers, salary, medical or
  sensitive leave data, and restricted documents. List views mask sensitive
  values by default.
- Maker-checker separation applies to workflow configuration, statutory rule
  activation, payroll approval, bank-file release, payment confirmation, and
  final settlement where configured.
- Uploads use signed URLs, type and size allowlists, checksum verification,
  malware scanning, quarantine, and private object storage.
- Exports are permission-controlled, time-limited, watermarked where
  appropriate, and fully audited.

## 10. Pakistan statutory design

The engine does not encode tax or contribution rates as permanent source-code
constants. Rule packs record jurisdiction, authority, source reference,
effective dates, version, approval, calculation method, thresholds, caps, and
rounding.

The normal Pakistan tax year runs from 1 July through 30 June, and employer
salary withholding is based on estimated tax-year salary with adjustment
through the year. Release-one rule packs must be reconciled to the applicable
Finance Act, Income Tax Ordinance, and FBR rate card before activation. See the
[FBR Income Tax Ordinance collection](https://fbr.gov.pk/Categ/Income-Tax--Income-Tax-Ordinance/326)
and [FBR withholding rate cards](https://ipv6.fbr.gov.pk/withholding-taxes-rate-card/174298/174301).

EOBI and provincial social-security rules are separate configurations with
their own coverage, wage bases, employee/employer shares, limits, and filing
evidence. Current planning references include the
[responsible ministry's EOBI guidance](https://ophrd.gov.pk/Detail/OGI0NzE3NGEtMzllOS00NjUwLTgzYjgtM2QwNzY4OGNkZWYy)
and [SESSI contribution guidance](https://mail.sessi.gov.pk/procedure-of-payment-of-social-security-contribution.php).
These links guide requirements; a qualified payroll/legal owner must approve
the exact active values and interpretations used in production.

## 11. Integrations

### 11.1 Attendance

Manual entry and approved corrections coexist with file import and a
vendor-neutral device adapter. Each adapter maps source employee/device IDs,
timestamps, timezone, direction, and source event ID into a canonical punch.
Unmapped employees, invalid timestamps, duplicates, and ambiguous shifts appear
in an exception workbench.

### 11.2 Bank payment

Bank formats are adapters selected per company/bank account. Export creation,
approval, download, and confirmation import are separate audited actions.
Files carry checksums and batch control totals. A payroll cannot be marked paid
until each included payment has an accepted reference or an approved exception.

### 11.3 Finance

Payroll publishes a balanced accounting event containing company, period,
source payroll ID, component/dimension breakdown, debit/credit lines, totals,
currency, and idempotency key. Finance owns acceptance, posting period, journal
number, reversal, and ledger state. Payroll stores the acknowledgement and
cannot mutate the posted journal.

## 12. Migration

Migration is a controlled product capability, not a collection of direct SQL
scripts:

1. Inventory and profile every source, owner, format, row count, quality issue,
   and sensitive field.
2. Approve mappings, code translations, default rules, identity matching, and
   document associations.
3. Store immutable source files in quarantine and load staging tables.
4. Validate required values, references, duplicates, effective-date overlaps,
   monetary totals, and document checksums.
5. Promote valid records through domain import services so normal constraints,
   audit, and numbering apply.
6. Produce count, control-total, balance, history, and exception reports.
7. Repeat full rehearsals until results are deterministic.
8. Freeze source changes, load the final delta, reconcile, obtain sign-off, and
   retain rollback evidence.

Migration work begins with Employee Core and continues in every dependent
wave. It is not deferred to the final release.

## 13. Verification strategy

Every module must include:

- unit tests for state machines, calculations, permissions, and edge cases;
- PostgreSQL integration tests for constraints, transactions, concurrency,
  effective dating, and repository behavior;
- API tests for validation, allowed/denied scopes, stale writes, idempotency,
  pagination, and safe errors;
- Next.js component and accessibility tests for loading, error, empty, denied,
  read-only, and successful states;
- Playwright journeys covering the relevant employee, manager, HR, payroll,
  Finance, and administrator roles;
- audit assertions for sensitive reads, writes, approvals, exports, and denied
  actions;
- migration reconciliation and business UAT evidence.

Payroll adds reviewed golden cases for tax, EOBI, provincial contributions,
proration, arrears, bonus, overtime, loans, unpaid leave, mid-period hire/exit,
and final settlement. At least two production-like parallel payrolls must
reconcile employee by employee before go-live.

Mandatory CI gates are formatting, lint, strict TypeScript, unit/integration
tests, migration verification, OpenAPI drift, production build, accessibility,
critical E2E journeys, dependency/secret scanning, and container scanning.

## 14. Operational design and acceptance targets

Next.js, API, and worker are separate Linux containers. Managed PostgreSQL,
Redis, and S3-compatible storage are preferred. Deployments use health checks,
rolling or blue/green replacement, expand/contract migrations, and an explicit
rollback decision.

Logs are structured and redact secrets and sensitive values. Correlation IDs
connect browser, API, job, audit, and integration events. Metrics and alerts
cover API errors/latency, queue depth, failed payroll/import/export jobs,
database health, storage failures, audit-write failures, payment failures, and
Finance acknowledgement delays.

Release-one targets on the agreed reference environment are:

- a 5,000-employee payroll completes within 15 minutes;
- 100,000 attendance rows import within 10 minutes with row-level exceptions;
- normal paginated API reads achieve p95 at or below 500 ms under the agreed
  concurrency test;
- encrypted point-in-time recoverable backups meet a 15-minute RPO and 4-hour
  RTO target;
- critical workflows meet WCAG 2.1 AA automated and manual checks;
- no unresolved critical/high security finding or known cross-company access
  path remains at release.

Restore, worker recovery, outbox retry, audit integrity, and deployment rollback
must be demonstrated before production cutover.

## 15. Delivery roadmap

The implementation plan must decompose work into the following gated waves:

| Wave | Outcome | Exit gate |
|---|---|---|
| W0 Baseline | Freeze live catalogue, repair existing test/lint drift, capture parity matrix and ADRs | Clean baseline build/test/lint and approved inventory |
| W1 Runtime conversion | Next.js, workspaces, Express API, worker, contracts, Docker, CI, PostgreSQL/Redis/S3 harness | Deployable authenticated shell and green infrastructure tests |
| W2 Control plane | Security, MFA, RBAC/scopes, workflow, audit, documents, notifications | Security and approval journeys pass with cross-company denial evidence |
| W3 Organisation & Employee Core | M03/M04 plus first migration rehearsal | Complete employee authority and effective history UAT |
| W4 Plan, Recruit & Hire | M05/M06/M07 | Requisition-to-confirmed-employee journey passes |
| W5 Time & Leave | M11/M12 | Locked attendance and approved leave produce reconciled payroll inputs |
| W6 Develop & Move | M08/M09 | Outcomes create approved, effective-dated transactions without direct payroll changes |
| W7 Payroll Configuration | M13 configuration plus M14 | Reviewed Pakistan rules and golden configuration cases pass |
| W8 Payroll Processing | M13 execution | Gross-to-net, review, approval, snapshot, payslip, and variance gates pass |
| W9 Pay & Account | M15 | Bank batch and balanced Finance event reconcile end to end |
| W10 Separate & Settle | M10 | Separation-to-closed-employee journey and final settlement reconcile |
| W11 Serve, Report & Go Live | M16/M17/M18/M19, full migration and hardening | Two parallel payrolls, DR/security/UAT sign-off, cutover readiness |

Every wave is divided into eight task packages: requirements/state/permission
matrix; schema/migrations/constraints; domain services/jobs/events; REST/OpenAPI;
Next.js screens/accessibility; automated/security tests; migration mapping and
reconciliation; evidence and UAT.

## 16. Definition of done

A module is complete only when:

1. Every in-scope prototype screen is mapped to a production route or an
   explicitly approved retirement.
2. No screen uses mock fixture data or a generic fallback in the production
   path.
3. State transitions and calculations execute on the backend and are protected
   by database invariants where possible.
4. Allowed, denied, cross-company, stale-write, retry, reversal, and audit paths
   are tested.
5. Sensitive fields are masked, permission-controlled, encrypted as required,
   and export-audited.
6. Migration mappings and reconciliation evidence are complete.
7. Build, lint, type checks, tests, accessibility, security, and performance
   gates pass.
8. Monitoring, support runbooks, backup/restore, and rollback are ready.
9. The responsible business owner signs UAT evidence.

## 17. Risks and controls

| Risk | Control |
|---|---|
| Prototype breadth encourages a big-bang rewrite | Vertical waves, feature flags, and per-screen traceability |
| Pakistan rules change during delivery | Effective-dated rule packs, source references, maker-checker activation, regression snapshots |
| Historical data is incomplete or inconsistent | Early profiling, staging/quarantine, exception ownership, repeatable rehearsals |
| Payroll concurrency or retries duplicate money/events | Period locks, idempotency, database uniqueness, immutable snapshots, outbox/inbox |
| Generic screens conceal missing behavior | Explicit 67-screen parity register and no-fallback completion gate |
| Cross-company access leaks employee/pay data | Central scope evaluator, field permissions, negative tests, audited sensitive reads |
| In-place runtime conversion destabilizes the approved UI | W0 characterization/visual baseline and incremental Next.js migration |
| Bank/device formats vary by provider | Adapter contracts; select and certify the first real format before its wave closes |

## 18. Required inputs by wave

The design is complete without inventing external facts, but implementation
requires the following owner-provided inputs before the named wave can close:

- W2: initial role catalogue, approval-policy owners, email delivery provider,
  and security/retention policy.
- W3: employee numbering rules, company/branch hierarchy, master-data owners,
  and migration source samples.
- W5: attendance device/vendor samples, shift rules, leave policies, holiday
  calendars, and opening balances.
- W7: signed Pakistan statutory interpretations, company registrations,
  salary structures, benefits, and loan policies.
- W9: selected bank file specification and Finance accounting-event consumer
  contract.
- W11: production infrastructure, support owners, cutover window, and business
  UAT signatories.

These are controlled implementation inputs, not permission to hard-code policy.
