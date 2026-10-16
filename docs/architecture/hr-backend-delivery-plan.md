# HR backend delivery plan

## Purpose

Deliver HR as a tenant-safe, API-first module that is shared by the web ERP and
future mobile clients. The browser must use `server/api`; it must never access
PostgreSQL, Redis or storage directly.

## Current delivery status

### Completed and API-backed

- Employee directory, company scope, HR master reads, employee draft creation,
  update, submission and maker/checker approval.
- Profile-draft assignments, employee contacts, emergency contacts, restricted
  document metadata, assignment timeline and employee status-history reads.
- Lifecycle-policy directory and draft policy authoring. Draft authoring creates
  a fixed pre-employment/employed definition and approval-required hire
  transition, with company scope, CSRF/origin validation, idempotency and audit
  evidence.

### Current safe resume point

- Governed employee Hire/activation, same-day Transfer and assignment-only
  Promotion are implementation-complete and verified through the API/repository
  against isolated PostgreSQL. The next development slice is governed manager
  change, followed by organisation and work-location changes. Each movement
  keeps its own request/decision/projection rules; do not generalize the
  existing workflows prematurely.
- Independent two-user browser acceptance for a real maker submission followed
  by a different checker decision remains an acceptance gate. Automated browser
  acceptance currently proves authenticated live maker/checker screens and API
  data loading; PostgreSQL integration tests prove both decision outcomes.
- Continue file upload/verification only after secure object-storage signing,
  malware scanning and audit finalization are wired.
- Recruitment, onboarding, attendance, leave, payroll, benefits, self-service,
  reporting and operational hardening remain planned, not live.

## Delivery rules

- Implement one coherent vertical slice at a time: contract -> migration ->
  repository -> service -> route -> tests -> generated client -> screen.
- Keep HR business rules, scope checks, approval transitions and audit writes
  on the server.
- Use existing Identity & Access as the source of users, sessions, permissions,
  company access and governed employee/user bindings. Do not duplicate user
  accounts in HR.
- Require tenant scope and permission checks for every API request. Enforce
  active company access server-side for company-scoped HR records.
- Prefer indexed, paginated list endpoints and small summary projections for
  quick ERP and mobile loading. Fetch sensitive employee information only from
  an explicitly authorized detail endpoint.
- Financial or statutory actions remain unavailable until lifecycle states,
  approval rules, idempotency, immutable evidence and integration tests exist.

## Module layout

Keep HR as one versioned API surface (`/api/v1/hr`) inside the independently
deployable `server/api` service. Separate feature code without introducing
premature network microservices:

```text
server/api/src/modules/hr/
  shared/       session context, tenant/company scope and future audit helpers
  employees/    employee directory, profile and governed employee workflows
  masters/      HR master data such as grades, designations and work locations
  attendance/   future time, shift and attendance capability
  leave/        future leave policy, balance and request capability
  payroll/      future restricted payroll and statutory capability
  reporting/    future permission-scoped reports and exports
```

Each feature owns its router, service and repository as it gains write
behavior. Shared Identity & Access remains outside HR and is reused for
sessions, permissions, company access, approvals and employee/user binding.

## Identity & Access integration baseline

- [x] Tenant-scoped server sessions, CSRF protection, login throttling and
      session revocation.
- [x] Governed user administration, roles, permissions, company access,
      approval and audit APIs.
- [x] Employee-to-user binding is already governed through
      `employee_user_binding` and the `employee_link` user-administration action.
- [x] HR permission definitions already exist in the security migration.
- [x] Confirm HR route-level permission and company-scope enforcement with the
      first HR API integration tests.

## Phase 1 — HR foundation and fast reads

- [x] Add shared HR request/response contracts and OpenAPI definitions.
- [x] Add a tenant-scoped HR API module with session authentication.
- [x] Add indexed employee directory and employee-detail projections.
- [x] Add company-scoped HR master-data projections.
- [x] Add an authenticated company-context projection that lists only active
      company access grants, so HR screens never derive company scope from
      prototype navigation state.
- [x] Enforce `hr.employee.read` / `hr.master.read` and active company access.
- [x] Add route/repository tests for unauthenticated, unauthorized,
      cross-tenant and cross-company requests using the isolated PostgreSQL test
      database.
- [x] Generate typed API-client methods for the HR foundation endpoints.
- [x] Add a separate, company-scoped draft directory so unassigned draft
      employees never bypass the active-assignment directory's scope model.
- [ ] The Employee Directory now uses the typed HR client to load the
      server-authorized company scope and compact employee projection, while
      retaining the existing prototype directory as a safe fallback. Verify it
      against the deployed API before removing that fallback or switching master
      data screens.

## Phase 2 — employee master and organisation changes

- [x] Safe employee draft creation: CSRF/origin protection, tenant/company
      scope, `hr.employee.create`, request idempotency and immutable platform audit
      evidence. Draft creation intentionally excludes assignments, activation,
      payroll, identity and sensitive data. The Add Employee screen uses this
      typed API boundary and retains the prototype form only as an unavailable-API
      fallback until deployment verification.
- [x] Draft profile update: draft-only, company-scoped, idempotent and
      immutably audited. It deliberately excludes employee number, assignment,
      lifecycle, payroll and sensitive-data changes.
- [x] Draft approval decision: pending/approved/rejected is isolated from
      activation; approval cannot create an active employment relationship. The
      pending, company-scoped approval queue and on-demand review detail are
      available through the same typed API boundary. A creator or submitter cannot
      decide their own draft, even if assigned the approval permission.
- [x] Employee edit, submit and approval workflow, each with a distinct
      lifecycle transition and audit record. The Employee Drafts & Approval
      workspace now lists server-scoped drafts, loads a selected draft on demand,
      and submits it with a required reason.
- [x] The separate Employee Approvals workspace uses the typed API client to
      review pending draft details and requires a reason plus confirmation to
      approve or reject. It never substitutes mock approvals for failed live
      requests. Targeted HR unit/integration tests and API/web builds pass; live
      browser/deployment verification remains open.
- [x] Employee email/phone contacts: the permission-scoped contacts screen and
      typed API use `hr.employee_contact.read/manage`, active company scope,
      append-only history, CSRF/origin validation, idempotency and audit evidence.
      It intentionally does not expose address, tax, bank, emergency-contact or
      document data.
- [x] Emergency contacts: the separately permission-scoped screen and typed
      API use `hr.employee_emergency_contact.read/manage`, enforce active employee
      company scope, prevent duplicate current priorities or primary contacts, and
      write immutable/audited records with CSRF, origin and idempotency controls.
- [x] Restricted employee-document metadata: typed API and Tailwind workspace
      use `hr.employee_document.read`, enforce active employee company scope,
      and return no object-storage key, upload URL or download URL.
- [ ] File upload/finalization, document verification/download, private/sensitive
      fields and field-level access. These remain blocked on a wired, audited
      S3/MinIO signing and malware/verification workflow.
- [x] Profile-draft assignment: approved draft -> validated company/master-data
      selection -> `employee_assignment.assignment_status = 'profile_draft'`.
      This is not an active employment assignment and cannot unlock payroll.
- [x] Assignment timeline read model: the typed API and Tailwind workspace use
      `hr.employee_assignment.read`, authorized employee company scope and a
      read-only, effective-dated projection. It includes protected
      `profile_draft` rows for pre-employment preparation without treating them
      as operational assignments or bypassing database history constraints.
- [ ] Effective-dated active employment assignment movement workflow.
      Same-day Transfer and assignment-only Promotion are complete as separate
      approval transitions with immutable audit evidence. Manager,
      organisation and work-location changes, pay-changing Promotion, and
      durable future-dated activation remain open.
- [x] Immutable employee status-history read model: typed API and Tailwind
      workspace use `hr.employment_history.read`, current company scope and a
      minimal status-event projection. Actor identifiers and mutable controls are
      deliberately excluded.
- [ ] Profile-history and lifecycle-event read models, plus the full immutable
      cross-workflow audit evidence view.

## Phase 3 — recruitment, onboarding and lifecycle

- [x] Employment lifecycle policy directory: typed API and Tailwind workspace
      use `hr.employment_lifecycle_policy.read`, authenticated company scope,
      bounded results and no mock fallback.
- [x] Employment lifecycle draft authoring: typed API and Tailwind workspace
      use `hr.employment_lifecycle_policy.manage`, company scope, CSRF/origin,
      idempotency, audit evidence and a fixed reviewable initial/hire definition.
- [x] Lifecycle-policy submission: a draft can move only to
      `pending_approval` through a typed, idempotent, CSRF/origin-protected and
      audited API path with a required reason. Submission cannot approve or
      activate a policy.
- [x] Lifecycle-policy independent approval: a pending policy can move only to
      `approved` through a distinct `hr.employment_lifecycle_policy.approve`
      permission, maker/checker separation, company scope, CSRF/origin,
      idempotency and audit evidence. Approval cannot activate a policy.
- [x] Lifecycle-policy activation: only an authorized independent approver can
      activate an approved policy that is effective today and has no overlapping
      active company policy. It is CSRF/origin-protected, idempotent and audited.
      Activation never creates an employee relationship or assignment.
- [x] Governed employee hire and activation. No
      employee employment relationship or active assignment may be created until
      an active policy and valid transition exist.
      **Implementation gate verified:** the existing `profile_draft` assignment
      deliberately has no `job_id`, and database constraints forbid converting
      it directly to an active assignment. The hire slice must therefore first
      introduce a governed job selection/read model, then create a new
      relationship-bound operational assignment alongside a pending,
      approval-required Hire request. It must not mutate the profile-draft row
      or activate an employee before the Hire request is independently decided.
- [x] Governed employee Hire request creation: `POST /api/v1/hr/employees/{employeeId}/hire_requests`
      validates an approved draft, authorized company, active job, matching
      profile-draft assignment and active approval-required Hire transition.
      It creates only a `draft` relationship plus a `pending` lifecycle request;
      employee status and assignments remain unchanged. The additive migration
      stores the protected job/profile context and validates it in PostgreSQL.
      Employee Assignments now prepares the required placement/master context
      and submits this request through the typed client with no mock success.
- [x] Independent Hire decision implementation: repository/service/router work
      enforces `hr.employment_lifecycle.approve`, company scope and
      requester/approver separation. Approval appends the Hire event before
      projecting the relationship, employee and new relationship-bound
      operational assignment; rejection never activates them. OpenAPI, the
      generated browser client, bounded pending queue/detail reads and
      mutation-route coverage are complete. Employee Approvals contains a
      separate live Hire checker section with required reason and confirmation.
      PostgreSQL integration proves creation, replay, conflicting idempotency,
      duplicate-pending rejection, company/tenant scope, self-approval denial,
      approval projections, profile-draft preservation and rejection
      non-activation.
- [x] Job catalog foundation: `job` is now a company-scoped HR master type and
      is available through the existing bounded, permission-scoped master API.
      This additive migration does not create jobs or alter any employee.
- [x] Governed job creation: `POST /api/v1/hr/jobs` uses `hr.master.create`,
      authenticated company scope, server validation, CSRF/origin, idempotency
      and immutable audit evidence. It creates only an active job catalog item;
      it cannot create an assignment, relationship or hire request.
- [ ] Manpower requisitions, vacancies, candidates, interviews and offers.
- [ ] Offer-to-employee conversion using the governed user-link boundary.
- [ ] Onboarding, probation, confirmation, transfer, resignation, termination,
      clearance and final-settlement workflow.

### Governed Hire verification record — 2026-10-16

- Applied source migrations in the isolated test database:
  `platform:7` (`hierarchical_audit_actions`) and `hr:27`
  (`hire_request_context_guard_fix`). Existing migration files were not edited.
- Fixed three runtime blockers found by real PostgreSQL execution: hierarchical
  HR audit action names rejected by the platform constraint, an ambiguous
  `assignment_status` reference in the Hire context trigger, and an incorrect
  initial-state lookup during Hire event append.
- Added authorized active branch/department reads through
  `GET /api/v1/hr/organization_units`; browser code still uses only the API.
- Added bounded Hire review reads:
  `GET /api/v1/hr/hire_requests` and
  `GET /api/v1/hr/employees/{employeeId}/hire_requests/{requestId}`.
- Observed verification:
  - `npm.cmd run typecheck` — passed.
  - contract OpenAPI test — 1 passed.
  - focused HR unit tests — 25 passed across router/client tests.
  - migration plus governed-Hire integration — 10 passed across two files.
  - focused new-panel ESLint — passed.
  - `npm.cmd run build:web` — passed on Next.js 16.3.8.
  - focused Playwright acceptance — 1 passed against the running web/API,
    covering login and live Assignments/Approvals surfaces.
  - `git diff --check` — passed.
- Repository-wide `npm.cmd run lint` is not green: it reports 122 pre-existing
  errors and one warning across legacy/shared screens. The two new Hire panels
  pass focused ESLint; no unrelated lint cleanup was included in this slice.
- Manual acceptance still required: use distinct maker and checker accounts to
  submit and decide a new Hire request in the browser, then confirm the active
  employee/relationship/assignment projections. Do not call this production
  accepted until that independent-user check is recorded.

### Governed Transfer verification record — 2026-10-16

- Added HR source migration `0028_governed_transfer_requests` and observed the
  isolated test database at HR schema version 28. The request table is tenant
  RLS protected, company/source scoped, immutable after decision, uniquely
  pending per source assignment, and indexed for checker queues and history.
- Added typed/OpenAPI Transfer endpoints:
  - `GET /api/v1/hr/transfer_requests`
  - `POST /api/v1/hr/employees/{employeeId}/transfer_requests`
  - `GET /api/v1/hr/employees/{employeeId}/transfer_requests/{requestId}`
  - `POST /api/v1/hr/employees/{employeeId}/transfer_requests/{requestId}/decision`
- Makers require `hr.employee_assignment.transfer`; independent decisions
  require `hr.employee_assignment.change`. Active company access, tenant scope,
  CSRF/origin validation, idempotency, immutable audit evidence and requester/
  checker separation remain server enforced.
- Approval closes the current assignment and inserts one relationship-bound
  `change_reason='transfer'` segment in the same serializable transaction.
  Rejection creates no assignment change. The database restricts this Transfer
  slice to branch/department changes; job, designation, grade, manager, work
  location and employment context remain unchanged.
- This first Transfer slice is deliberately same-day effective. Future-dated
  approval is blocked until a durable activation worker can switch segments
  without creating an authorization gap.
- Existing Employee Assignments and Employee Approvals pages now contain live
  Transfer maker/checker panels. API failure never substitutes prototype data.
- Observed verification:
  - `npm.cmd run typecheck` — passed.
  - focused OpenAPI contract test — 1 passed.
  - focused HR router/client unit tests — 27 passed.
  - PostgreSQL governed-Transfer integration — 2 passed, proving replay,
    conflicting idempotency, duplicate-pending rejection, company scope,
    self-approval denial, approval projection and rejection non-projection.
  - source migration suite — 8 passed with HR version 28.
  - `npm.cmd run api:check` — passed.
  - focused ESLint for new Transfer panels/client/router/service — passed.
  - `npm.cmd run build:web` — passed on Next.js 16.3.8.
  - focused Playwright acceptance — 1 passed against live web/API, covering
    authenticated Assignments and Approvals surfaces for Hire and Transfer.
- Repository-wide `npm.cmd run lint` is not green: it reports 114 errors and
  one warning across pre-existing legacy/shared screens, including existing
  effect-state and label findings in the two host HR workspaces. The new
  Transfer panels, client, router, service and repository pass focused ESLint.
- Manual acceptance remains: use distinct maker/checker accounts to submit and
  decide a new Transfer in the browser, then confirm the assignment timeline.

### Governed Promotion verification record - 2026-10-16

- Added HR source migration `0029_governed_promotion_requests` and observed the
  isolated test database at HR schema version 29. The request table is tenant
  RLS protected, company/source scoped, immutable after decision, uniquely
  pending per source assignment, and indexed for checker queues and history.
- Added typed/OpenAPI Promotion endpoints:
  - `GET /api/v1/hr/promotion_requests`
  - `POST /api/v1/hr/employees/{employeeId}/promotion_requests`
  - `GET /api/v1/hr/employees/{employeeId}/promotion_requests/{requestId}`
  - `POST /api/v1/hr/employees/{employeeId}/promotion_requests/{requestId}/decision`
- Request and decision operations require the existing
  `hr.employee_assignment.change` permission. Active company access, tenant
  scope, CSRF/origin validation, idempotency, immutable audit evidence and
  requester/checker separation remain server enforced. Actor-level separation
  prevents self-approval even when maker and checker share the permission.
- Approval closes the current assignment and inserts one relationship-bound
  `change_reason='promotion'` segment in the same serializable transaction.
  Only job, designation and job grade come from the protected request; branch,
  department, cost centre, work location, employment type, category and manager
  are copied from the locked source assignment. Rejection creates no assignment
  projection.
- Promotion is deliberately assignment-only. Contracts expose no compensation
  fields, repository code does not write payroll tables, and PostgreSQL tests
  prove a real effective `hr_salary_assignment` row is identical before and
  after both approval and rejection. Pay-changing Promotion remains blocked on
  a separate production salary-revision API and approval workflow.
- This first Promotion slice is same-day effective. Future-dated approval is
  blocked until a durable activation worker can switch assignment segments
  without creating an authority gap.
- Existing Employee Assignments and Employee Approvals pages now contain live
  Promotion maker/checker panels, including explicit compensation-isolation
  messaging. API failure never substitutes prototype data.
- Observed verification:
  - `npm.cmd run typecheck` - passed.
  - focused OpenAPI contract test - 1 passed.
  - focused HR router/client unit tests - 29 passed.
  - PostgreSQL governed-Promotion integration - 2 passed, proving replay,
    conflicting idempotency, duplicate-pending rejection, company scope,
    self-approval denial, atomic approval projection, rejection non-projection,
    unchanged non-role context and unchanged salary rows.
  - Hire, Transfer, Promotion and migration regression suite - 14 passed;
    source migration suite reports HR version 29.
  - `npm.cmd run api:check` - passed.
  - focused ESLint for Promotion panels/client/router/service/repository/tests -
    passed.
  - `npm.cmd run build:web` - passed on Next.js 16.3.8.
  - focused Playwright acceptance - 1 passed against the already-running local
    web/API, covering authenticated Assignments and Approvals surfaces for Hire,
    Transfer and Promotion.
  - `git diff --check` - passed before this handoff update.
- Repository-wide lint remains a known pre-existing cleanup area and was not
  used as the acceptance gate for this focused slice. New Promotion files and
  touched API/client/test files pass focused ESLint.
- Manual acceptance remains: use distinct maker/checker accounts to submit and
  decide a new Promotion in the browser, then confirm the assignment timeline.

## Currently backend-connected HR pages

Local web base: `http://127.0.0.1:3000` (API: `http://127.0.0.1:4000/api/v1`).

- `/#/hr/employees` — server-scoped employee directory; prototype fallback is
  still retained while deployed API acceptance remains open.
- `/#/hr/add-employee` — governed employee draft creation; unavailable-API
  fallback remains explicit.
- `/#/hr/employee-drafts` — draft directory, detail, update and submission.
- `/#/hr/employee-approvals` — employee draft, Hire, Transfer and Promotion
  checker queues and decisions.
- `/#/hr/employee-contacts` — governed email/phone contact history.
- `/#/hr/employee-emergency-contacts` — governed emergency contacts.
- `/#/hr/employee-documents` — restricted document metadata reads only.
- `/#/hr/employee-assignments` — profile context, Hire submission, assignment
  timeline, Transfer submission and assignment-only Promotion submission.
- `/#/hr/employee-status-history` — immutable status-history projection.
- `/#/hr/lifecycle-policies` — policy directory, authoring, submission,
  independent approval and activation.
- `/#/hr/jobs` — company-scoped job catalogue and governed job creation.

Other HR prototype pages remain mock/prototype unless separately marked above.

## Phase 4 — attendance and leave

- [ ] Shifts, holidays, assignments and attendance ingestion.
- [ ] Attendance calculation, corrections, overtime and attendance-period lock.
- [ ] Leave policies, balances, requests, approvals and immutable transactions.

## Phase 5 — payroll, benefits and payments

- [ ] Payroll configuration, salary structures, components and revisions.
- [ ] Payroll inputs, calculation, validation and approval.
- [ ] Statutory/localization calculation snapshots and evidence.
- [ ] Payslip release, governed payment batches and finance handoff.
- [ ] Loans, benefits and recoveries.

## Phase 6 — self-service, reporting and operations

- [ ] Employee/manager self-service endpoints with restricted projections.
- [ ] Cached, permission-scoped reporting and export jobs.
- [ ] Background processing through `server/worker`, durable job status and
      operational metrics.
- [ ] Performance/load testing, backup/restore drill and production readiness.

## Definition of done for each HR capability

- [ ] Contract and OpenAPI entry are versioned.
- [ ] Tenant, company and permission enforcement is tested.
- [ ] Server-side validation and safe error responses exist.
- [ ] Audit/lifecycle/idempotency controls exist where the operation mutates
      records or can affect pay, employment or compliance.
- [ ] Repository queries use appropriate indexes and bounded pagination.
- [ ] Integration tests and production build pass.
- [ ] The relevant screen uses the API client; mock data is clearly retained or
      removed only after verification.

## Employee and assignment UI linkage

```text
HR screen -> feature integration/hook -> HrApiClient -> /api/v1/hr
         -> HR service -> repository -> PostgreSQL
```

The employee detail/draft screens own their presentation state. `HrApiClient`
is the only browser-facing data boundary; it uses the generated API client and
the authenticated session. Assignment forms fetch company-scoped master options
from `/hr/masters`, submit a narrow assignment request, and refresh only the
affected employee/draft data after a successful response. No screen receives
database credentials or makes a direct storage call.
