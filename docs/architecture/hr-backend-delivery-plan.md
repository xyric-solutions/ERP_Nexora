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

- Governed employee Hire/activation is implementation-complete and verified
  through the API/repository against isolated PostgreSQL. The next development
  slice is effective-dated employee movement (transfer first, then promotion,
  manager and organisation changes) using the same request/decision/event/
  projection pattern. Do not reuse the Hire request as a generic movement.
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
- [ ] Effective-dated active employment assignment activation and employee
      movement workflow (transfer, promotion, manager and organisation changes),
      each with a separate approval transition and immutable audit evidence.
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
