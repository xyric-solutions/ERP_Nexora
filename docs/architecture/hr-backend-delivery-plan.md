# HR backend delivery plan

Current checkpoint: Payroll Runs and Payroll Review & Approval are Live for the verified production scope: frozen attendance, governed salaries and one-off inputs, monetary overtime, funded same-currency loan recovery, published statutory execution, dated jurisdiction evidence, return/recalculation comparison, independent approval, Finance journal handoff and immutable audit. Category-scoped employee Payroll jurisdiction overrides, separately reviewed revocations and whole-account cost-centre mappings remain delivered. Normal and isolated schemas are HR130. HR navigation is 75 Live, 0 In progress, 1 Payment Batch Read-only and 0 prototype screens. Live status does not claim support for employee-level/proportional dimensions, non-parity loan FX, general posted-Payroll corrections, cross-country execution or every legal allocation basis; those require separately reviewed contracts. Banking integration is separately owned. These are menu statuses, not a completion percentage.

## Purpose

Deliver HR as a tenant-safe, API-first module that is shared by the web ERP and
future mobile clients. The browser must use `server/api`; it must never access
PostgreSQL, Redis or storage directly.

## Current delivery status

### Completed and API-backed

- Time & Leave now has all six menu screens connected to the live API: Leave
  Types, Leave Balances, Attendance, Leave Requests, Add Leave Request and Leave
  Approval. Current HR menu coverage is 43/76 (56.6%); 33 screens remain prototype.
  This is screen coverage, not overall HR/payroll production readiness.

- Attendance & Shifts is now 8/8 API-connected menu screens. Overtime, Attendance
  Period Close and Attendance → Payroll Inputs complete the connected section.
  The attendance completion checkpoint was 37/76 (48.7%).
  This measures screen coverage, not full HR/payroll production readiness.

- Organization Structure now reads the shared Platform organization authority
  through a company-scoped HR API. Authorized maintainers can create child
  units, edit their parent/code/name, and activate or deactivate unused units.
  Mutations enforce company scope, `hr.organization.update`, CSRF/origin,
  idempotency, hierarchy-cycle protection, usage guards and immutable audit
  evidence. Company creation remains a Platform-administration responsibility.
- Designations now use the company-scoped HR master API for live list/search,
  creation, editing and activation/deactivation. Writes enforce `hr.master.create`
  or `hr.master.update`, browser mutation controls, idempotency, uniqueness and
  immutable audit evidence.
- Job Grades now use a dedicated company-scoped catalogue for grade ordering,
  ISO currency and optional minimum/midpoint/maximum compensation bands. Live
  create/edit/status maintenance enforces permissions, company scope, unique
  grade levels, coherent bands, browser mutation controls, idempotency and
  immutable audit evidence. Grade bands are configuration only and do not post
  payroll or change employee pay.
- Cost Centres now use the live company-scoped master catalogue for search,
  create, edit and status maintenance. The screen states the ownership boundary:
  cost centre identity is shared by HR assignments and Finance, while payroll
  nominal-account mapping remains a separate Finance-controlled concern.
- Work Locations, Employment Types and Employee Categories now use the same
  governed live catalogue while retaining their distinct ERP configuration:
  working pattern, downstream payment route and pay cycle. New records require
  these values; existing records remain visible and are explicitly flagged when
  configuration has not yet been supplied.
- HR Dashboard now uses a company-scoped live summary endpoint for effective
  headcount, drafts, employee approvals, governed movement approvals, active
  departments, recent joiners, employee-status distribution and master-data
  configuration gaps. Recruitment, attendance, leave and payroll figures stay
  explicitly unavailable until those backends are delivered.
- Finance / Payroll Dashboard now reads effective salary coverage, payroll
  periods, immutable result totals, journal proposals and governed payment
  batches through a company-scoped payroll-reporting endpoint. It exposes
  control gaps and empty states without calculating, approving, posting or
  paying payroll and without substituting prototype totals.
- Employee directory, company scope, HR master reads, employee draft creation,
  update, submission and maker/checker approval.
- Employee Record now opens from the live directory by stable employee ID and
  loads the secured detail projection. It presents current placement, work
  profile, manager and account-link state without exposing private payroll,
  bank, tax or document-storage fields.
- Positions & Organisation now provides a live current-workforce position view
  from effective employee assignments, approved jobs, designations, grades,
  departments and reporting managers. It does not infer vacancies or budgeted
  establishment where no position-authority record exists.
- Manpower Requisitions now provide a company-scoped, governed recruitment
  entry point. Creation validates active organisation and HR masters plus the
  selected grade's configured salary band; submit and independent
  approve/reject decisions use CSRF/origin checks, idempotency, company scope
  and immutable audit evidence. Approval only authorizes headcount; it does
  not create a job opening, candidate, employee or payroll transaction.
- Job Openings now provide a company-scoped recruitment register. New openings
  can only use an approved requisition, and server-side headcount control
  prevents all non-cancelled openings from exceeding that approval. Opening
  state changes are CSRF/origin protected, idempotent and immutably audited.
- Candidate Directory now provides a company-scoped live identity register for
  recruitment. It supports controlled create, search and archive/reactivate
  actions with company scope, permissions, CSRF/origin checks, idempotency and
  immutable audit evidence. Applications, evaluations, offers and employee
  creation remain separate controlled workflows.
- Recruitment Pipeline now uses a live company-scoped application register,
  linking active candidates to open, unexpired job openings. Search, stage
  filtering and pagination use API projections. Sequential stage decisions
  require a reason and expected current stage; duplicate applications,
  stale decisions, invalid transitions and unauthorized scope are rejected.
  Transactional stage history is append-only; concurrent retries are
  idempotent and all writes retain platform audit evidence. Interview and
  Evaluation stage transitions require scheduling/completion evidence.
  Selection uses the separate interview-evidence gate; hiring remains locked
  until the accepted-offer workflow is delivered.
- Interviews & Evaluations now uses a live application-scoped evidence
  workspace for scheduling, version-checked rescheduling, completion,
  cancellation and no-show outcomes. Each signed-in panel member submits one
  immutable scorecard against the stored weighted interview template.
  Mandatory assessments retain immutable final outcomes. Selection requires
  HR approval permission, the Evaluation stage, every non-cancelled interview
  completed, all panel scorecards, at least two distinct evaluators, a weighted
  average of 65% or above, no Hold/No-hire recommendation, and all mandatory
  assessments passed. Application locking serializes evidence with decisions;
  CSRF/origin, scope, idempotency and platform audit evidence cover every write.
  Policy v1 and stored templates are shared contracts, separate from fixtures.
- Offer Management now provides a compensation-permission-scoped offer register,
  selected-application context, governed draft editing, submission, independent
  approval/rejection, immutable letter generation/download, delivery recording,
  candidate acceptance/decline, expiry and withdrawal. Role, grade, branch,
  department, employment type, currency and salary range derive from the
  approved requisition. Submission freezes terms; compensation outside its
  range requires a reason plus explicit approval with salary-approval
  permission. Existing governed super-admin overrides retain separate evidence.
  Application/opening locks serialize headcount reservations across competing
  approvals. Accepted offers reserve a position without creating employment,
  posting payroll or sending messages. Response references and dates, versions,
  idempotency, CSRF/origin and immutable history govern every write. Salary
  read permission is required alongside HR read access for offer data.
- Create Employee from Offer now provides an atomic, idempotent accepted-offer
  handoff into the existing employee draft authority. Candidate identity and
  contact details, agreed joining date and immutable recruitment links carry
  forward. Existing profile approval still precedes an assignment. The initial
  assignment and hire date must match accepted terms; future profile assignments
  are readable only within authorized company scope. The existing governed hire
  panel is available directly on the handoff screen. Hire approval advances the
  application to Hired and records its event in the same transaction. Opening
  filled/unfilled counts reflect governed hires, including future commitments;
  effective workforce headcount remains date-based. Salary setup and payroll
  remain governed separately; agreed gross is retained as offer evidence.
- Shifts & Rules now uses the shared attendance shift/break/rotation authorities
  through a company-scoped API. Fixed, multiple, overnight and flexible shifts
  retain explicit timezone, optional shared work location, paid/unpaid breaks,
  working requirements, weekly off days and attendance/overtime thresholds.
  Weekly rotations use configured active leaf shifts at the same company,
  timezone and site, with a Monday anchor and server-resolved date preview.
  Version checks, idempotency and immutable rule/audit snapshots govern writes.
  Assigned or rotation-referenced rules cannot be rewritten; copy them to a new
  code for future arrangements. Current/future allocations and active rotation
  members block deactivation. Active shifts also protect their shared work site
  from deactivation. Legacy rows remain visible with explicit configuration gaps.
  Creating shifts does not allocate employees, derive attendance or pay overtime.
- Shift Assignments now uses the existing effective-dated allocation authority
  through a company-scoped API. Employee, department and branch allocations
  support explicit replacement, prospective closing and cancellation of unstarted
  records. The original identity, interval history and related replacement links
  remain retained with immutable events and platform audit references. Overlap
  exclusion, version checks, idempotency and company/role checks govern writes.
  Employee allocations require complete approved employment coverage and matching
  work location; organisation defaults use company-wide shifts and exact active
  target types. Employee preview resolves placement, employee > department >
  branch precedence and weekly rotation on the selected date, with explicit
  blockers instead of fixture or silent fallback. Locked attendance periods
  protect affected dates, and scheduled organisation defaults protect their
  target unit from deactivation. Creating/ending allocations does not post
  attendance, approve overtime or calculate/pay payroll.
- Profile-draft assignments, employee contacts, emergency contacts, restricted
  document metadata, assignment timeline and unified employee-history reads
  covering status changes, lifecycle events and non-sensitive profile versions.
- Lifecycle-policy directory and draft policy authoring. Draft authoring creates
  a fixed pre-employment/employed definition and approval-required hire
  transition, with company scope, CSRF/origin validation, idempotency and audit
  evidence.
- Governed employee Hire/activation plus same-day Transfer, assignment-only
  Promotion, reporting-manager change, work-location change and complete
  organization-placement change. Manager change supports either an eligible
  same-company manager or an explicit reviewed clear action. Work-location
  change requires approved, active and effective jurisdiction evidence.

### Current safe resume point

- Governed employee Hire/activation, same-day Transfer, assignment-only
  Promotion, reporting-manager change, work-location change and complete
  organization-placement change are implementation-complete and verified
  through the API/repository against isolated PostgreSQL. The immutable
  lifecycle-event/profile-history read models are also complete. The next safe
  slice is the permission-scoped cross-workflow audit-evidence view, followed
  by separately designed lifecycle transitions. Keep each mutation workflow
  separate; do not generalize movement rules prematurely.
- Independent two-user browser acceptance for a real maker submission followed
  by a different checker decision remains an acceptance gate. Automated browser
  acceptance currently proves authenticated live maker/checker screens and API
  data loading; PostgreSQL integration tests prove both decision outcomes.
- Continue file upload/verification only after secure object-storage signing,
  malware scanning and audit finalization are wired.
- Recruitment is live through interview evidence, selection, governed accepted
  offers and the employee draft/approval/assignment/hire handoff. Offer acceptance
  and draft creation alone do not mark the application Hired. Shifts & Rules
  and Shift Assignments are now live, including effective dates, scoped allocation,
  deterministic precedence, date preview and protected history. Next in menu
  order: Overtime, preserving separate requests, approvals and payroll settlement. Daily
  Attendance now reads real punches, approved per-day leave and corrections.
  Onboarding, attendance, leave, payroll operations, benefits, self-service
  and reporting remain planned.

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
- [x] The Employee Directory uses the typed HR client to load the
      server-authorized company scope and compact employee projection. The
      prototype fallback has been removed, API failures never substitute mock
      people, and Open routes by stable employee ID to the live Employee Record.

## Phase 2 — employee master and organisation changes

- [x] Live organization hierarchy: company-scoped tree reads include inactive
      history, current organization heads and direct current-assignment counts.
      Child-unit create/edit/status operations use the typed API and generated
      client; active children or assignments prevent deactivation.
- [x] Safe employee draft creation: CSRF/origin protection, tenant/company
      scope, `hr.employee.create`, request idempotency and immutable platform audit
      evidence. Draft creation intentionally excludes assignments, activation,
      payroll, identity and sensitive data. The Add Employee screen uses this
      typed API boundary and shows an explicit unavailable state without mock
      employee data when the API or permission check fails.
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
      Same-day Transfer, assignment-only Promotion and reporting-manager change
      plus work-location change are complete as separate approval transitions
      with immutable audit evidence. Complete organization-placement change is
      also complete. Pay-changing Promotion and durable future-dated activation
      remain open.
- [x] Immutable employee status-history read model: typed API and Tailwind
      workspace use `hr.employment_history.read`, current company scope and a
      minimal status-event projection. Actor identifiers and mutable controls are
      deliberately excluded.
- [x] Profile-history and lifecycle-event read models: typed, cursor-paginated
      API projections and the unified Employee History workspace expose only
      non-sensitive profile snapshots and canonical lifecycle event classes.
      Actor identifiers and private employee fields are excluded by contract.
- [ ] Full immutable cross-workflow audit evidence view.

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

### Governed manager-change verification record - 2026-10-16

- Added HR source migration `0030_governed_manager_change_requests` and
  observed the isolated test database at HR schema version 30. The request
  table is tenant-RLS protected, company/source scoped, immutable after
  decision, uniquely pending per source assignment, and indexed for checker
  queues and employee history.
- Added typed/OpenAPI manager-change endpoints:
  - `GET /api/v1/hr/manager_change_requests`
  - `POST /api/v1/hr/employees/{employeeId}/manager_change_requests`
  - `GET /api/v1/hr/employees/{employeeId}/manager_change_requests/{requestId}`
  - `POST /api/v1/hr/employees/{employeeId}/manager_change_requests/{requestId}/decision`
- Makers require `hr.employee_assignment.manager_change`; independent
  decisions require `hr.employee_assignment.change`. Active company access,
  tenant scope, CSRF/origin validation, idempotency, immutable audit evidence
  and requester/checker separation are server enforced.
- A request must express exactly one intent: select another eligible manager or
  explicitly set `clear_reporting_manager=true`. Omitted or ambiguous null
  values cannot silently clear the reporting line. Same-manager, self-manager,
  ineffective/cross-company manager and recursive reporting-cycle outcomes are
  rejected.
- Approval closes the current assignment and inserts one relationship-bound
  `change_reason='manager_change'` segment in the same serializable transaction.
  Only `reporting_manager_id` changes; company, branch, department, job,
  designation, grade, cost centre, work location, employment type, category
  and relationship are copied from the locked source. Rejection creates no
  assignment projection.
- Contracts expose no compensation fields, repository code does not write
  payroll tables, and PostgreSQL tests prove an effective salary assignment is
  unchanged after approval. Explicit manager clearing is covered by a real
  approved PostgreSQL workflow.
- Existing Employee Assignments and Employee Approvals pages now contain live
  manager-change maker/checker panels. They include explicit no-manager intent,
  independent-approver messaging, loading/empty/error/success states, and no
  mock success fallback.
- Observed verification:
  - `npm.cmd run typecheck` - passed.
  - `npm.cmd run api:check` - passed.
  - focused OpenAPI contract test - 1 passed.
  - focused HR router/client unit tests - 31 passed.
  - manager-change plus migration integration - 11 passed across two files.
  - Hire, Transfer, Promotion, manager-change and migration regression suite -
    17 passed across five files; source migration state reports HR version 30.
  - focused Prettier check for new panels/integration acceptance and generated
    contract/client files - passed; formatter-only churn in older files was
    deliberately removed from the final diff.
  - focused ESLint for new panels and changed contract/API/client/test logic -
    passed.
  - `npm.cmd run build:web` - passed on Next.js 16.3.8.
  - local web returned HTTP 200; API liveness and readiness passed on port 4000
    with database, Redis, object storage and HR-foundation checks healthy.
  - `git diff --check` - passed before this handoff update.
- The two host HR workspaces retain five pre-existing focused-lint findings
  (older synchronous effect-state resets and one older label association).
  They were not broadened into this movement slice; all new manager-change
  files and changed backend/client/test logic pass focused ESLint.
- Browser acceptance for the new manager-change panels is not yet recorded.
  Synthetic Playwright credential variables were absent, and the Windows
  browser helper failed during initialization before any UI input. Use distinct
  maker/checker accounts to submit and decide a real manager change, then
  confirm the assignment timeline and explicit-clear behavior.
- The standalone `db:migrate:source` command could not run from this shell
  because `DATABASE_URL` was intentionally absent. The running API uses its own
  configuration and remained ready after watch restart. Before manual manager-
  change acceptance, verify that its configured database reports HR migration
  30; do not infer this only from API health.
- Checklist progress remains 30/49 (about 61%) because the broader movement
  checkbox still includes organisation/work-location and future-dated work.
  The next safe implementation slice was governed work-location change.

### Governed work-location-change verification record - 2026-10-16

- Added HR source migration `0031_governed_work_location_change_requests` and
  observed the isolated test database at HR schema version 31. The request
  table is tenant-RLS protected, company/source scoped, immutable after
  decision, uniquely pending per source assignment, and indexed for checker
  queues and employee history.
- Added typed/OpenAPI work-location-change endpoints:
  - `GET /api/v1/hr/work_location_change_requests`
  - `POST /api/v1/hr/employees/{employeeId}/work_location_change_requests`
  - `GET /api/v1/hr/employees/{employeeId}/work_location_change_requests/{requestId}`
  - `POST /api/v1/hr/employees/{employeeId}/work_location_change_requests/{requestId}/decision`
- Maker and independent checker operations require the existing
  `hr.employee_assignment.change` permission. Active company access, tenant
  scope, CSRF/origin validation, idempotency, immutable audit evidence and
  actor-level requester/checker separation are server enforced.
- Request creation accepts only a different active company work location with
  an approved, active and effective `hr_work_location_profile`. Approval locks
  and revalidates that jurisdiction evidence so a profile invalidated after
  submission cannot be used. Rejection remains available when approval is
  blocked, allowing the pending request to be closed safely.
- Approval closes the current assignment and inserts one relationship-bound
  `change_reason='work_location_change'` segment in the same serializable
  transaction. Only `work_location_id` changes. All normalized organization
  placements and unrelated assignment context are copied from the locked
  source, and effective salary-assignment rows remain unchanged. Rejection
  creates no assignment projection.
- Existing Employee Assignments and Employee Approvals pages now contain live
  work-location-change maker/checker panels with loading, empty, error,
  permission, confirmation and success states. They expose jurisdiction
  readiness to the checker and never substitute prototype data for API failure.
- Observed verification:
  - `npm.cmd run typecheck` - passed.
  - `npm.cmd run api:check` - passed after repository-owned client generation.
  - focused OpenAPI contract test - 1 passed.
  - focused HR router/client unit tests - 33 passed.
  - Hire, Transfer, Promotion, manager-change, work-location-change and source
    migration regression suite - 20 passed across six files; the source
    migration state reports HR version 31.
  - focused ESLint for both new work-location panels - passed. The changed
    contract/API/client/test logic also produced no focused-lint findings.
  - `npm.cmd run build:web` - passed on Next.js 16.3.8.
  - local web returned HTTP 200. API liveness and readiness returned HTTP 200
    on `/api/v1/health/live` and `/api/v1/health/ready`; database, Redis,
    object-storage and HR-foundation readiness checks were healthy.
  - `git diff --check` - passed before this handoff update.
- The two host HR workspaces retain five pre-existing focused-lint findings
  (older synchronous effect-state resets and one older label association).
  They were not broadened into this slice; both new work-location panels pass
  focused ESLint without suppressions.
- Independent two-user browser acceptance remains open. Use distinct maker and
  checker accounts to submit and decide a real work-location change, verify
  approval is unavailable for missing/invalid jurisdiction evidence, and
  confirm the assignment timeline, organization placement and salary remain
  correct.
- The running API is healthy, but readiness does not prove that its configured
  database has HR migration 31. The isolated integration database is verified
  at version 31. Confirm the configured development database migration state
  before browser acceptance; do not expose or infer database credentials.
- Checklist progress remains 30/49 (about 61%) because the broader movement
  checkbox still includes remaining organization placement and future-dated
  activation. The next safe implementation slice was a separately governed
  complete organization-placement change.

### Governed organization-placement-change verification record - 2026-10-16

- Added HR source migration
  `0032_governed_organization_placement_change_requests` and observed the
  isolated test database at HR schema version 32. It adds an immutable,
  tenant-RLS-protected request table plus an authoritative hierarchy-validation
  function for business unit, division, branch, department and warehouse.
- Added typed/OpenAPI organization-placement endpoints:
  - `GET /api/v1/hr/organization_placement_change_requests`
  - `POST /api/v1/hr/employees/{employeeId}/organization_placement_change_requests`
  - `GET /api/v1/hr/employees/{employeeId}/organization_placement_change_requests/{requestId}`
  - `POST /api/v1/hr/employees/{employeeId}/organization_placement_change_requests/{requestId}/decision`
- Maker and checker operations require `hr.employee_assignment.change`, active
  company access, tenant scope, CSRF/origin validation, idempotency, immutable
  audit evidence and actor-level maker/checker separation.
- Requests carry complete current and proposed normalized snapshots. PostgreSQL
  and repository validation require at least one retained placement, a material
  change, correct active unit types, legal-company scope and one coherent
  ancestry chain. Approval revalidates readiness under locks; rejection remains
  available when readiness later fails.
- Approval atomically closes the source and creates one relationship-bound
  `change_reason='organization_change'` segment containing exactly the approved
  hierarchy. Legal company, job, designation, grade, cost centre, work location,
  employment type, category, manager and salary remain unchanged.
- Transfer approval now preserves source business-unit, division and warehouse
  placement rows while replacing only its approved branch and department.
- Employee Assignments and Employee Approvals now contain live maker/checker
  panels with hierarchy filtering/comparison, loading, empty, error,
  permission, confirmation and success states. API failure never becomes mock
  success.
- Observed verification:
  - `npm.cmd run typecheck` - passed.
  - `npm.cmd run api:check` - passed.
  - focused HR router/client unit tests - 35 passed.
  - focused OpenAPI contract test - 1 passed.
  - Hire, Transfer, Promotion, manager-change, work-location/organization and
    migration regression suite - 21 passed across six files; migration state
    reports HR version 32.
  - focused ESLint for new panels and changed contract/API/client/test logic -
    passed after correcting explicit control-label associations.
  - `npm.cmd run build:web` - passed on Next.js 16.3.8.
  - local web and API liveness/readiness returned HTTP 200; database, Redis,
    object-storage and HR-foundation readiness checks were healthy.
  - `git diff --check` - required before commit.
- Independent two-user browser acceptance remains open. Use distinct maker and
  checker accounts to submit and decide a complete hierarchy change, then
  confirm the assignment timeline, normalized placement rows and unchanged
  salary/non-organization context.
- The isolated integration database is verified at HR version 32. Confirm the
  running development API database migration version before browser acceptance;
  health readiness alone does not prove that version.
- At that verification point checklist progress remained 30/49 (about 61%)
  because the broad movement item still included pay-changing Promotion and
  durable future activation. The lifecycle-event/profile-history read-model
  slice described next has since been completed.

### Employee History read-model verification record - 2026-10-16

- Added HR source migration `0033_employee_history_read_model`, observed the
  isolated integration database at HR schema version 33, and preserved the
  existing migration chain. The migration creates missing baseline profile
  history and appends a corrected current version when a legacy open snapshot
  differs from the employee projection; it does not rewrite prior evidence.
- Added typed, bounded and opaque-cursor-paginated read endpoints:
  - `GET /api/v1/hr/employees/{employeeId}/lifecycle_events`
  - `GET /api/v1/hr/employees/{employeeId}/profile_history`
- Both endpoints require `hr.employment_history.read`, active employee/company
  scope and tenant isolation. Lifecycle output uses canonical event classes;
  profile output is a deliberately narrow non-sensitive projection that omits
  birth date, personal contact details and actor identifiers.
- Draft creation now records the initial profile version in the same database
  transaction. A material draft-profile update closes the current version and
  appends exactly one successor; idempotent replays and no-op updates do not
  duplicate history.
- The existing `/#/hr/employee-status-history` route is now the unified
  **Employee History** workspace with Status Changes, Lifecycle Events and
  Profile Versions tabs. It uses only the typed API client, provides separate
  loading/empty/error states and independent `Load older` pagination, and does
  not fall back to prototype data.
- Observed verification:
  - `npm.cmd run typecheck` - passed.
  - `npm.cmd run api:generate` and `npm.cmd run api:check` - passed.
  - focused HR router/client unit suite - 37 passed across two files.
  - OpenAPI contract suite - 2 passed.
  - migration and governed Hire/Transfer/Promotion/manager/work-location/
    organization-placement regression - 23 passed across seven files; the
    isolated database reports HR version 33.
  - focused draft profile-version integration - 1 passed (16 unrelated tests
    skipped by the test-name filter).
  - focused ESLint and Prettier checks for the new/changed implementation -
    passed. The host `prototype-content.tsx` retains older unrelated lint and
    formatting findings; this slice changed only its workspace import/render.
  - `npm.cmd run build:web` - passed on Next.js 16.3.8.
  - local web and API liveness returned HTTP 200. API readiness reported
    database, Redis, object storage and HR foundation healthy.
  - `git diff --check` - required after this handoff update.
- The complete `hr-foundation-api` file was not recorded as green: four older
  assertions fail against the persistent isolated fixture state (three stale
  company-grant assumptions and one assignment-projection assertion). The new
  profile-version test passes independently; the unrelated failures were not
  hidden or broadened into this slice.
- Browser acceptance of all three tabs remains open. The isolated database is
  verified at HR version 33, but API health does not prove the running
  development database has that migration. Confirm its configured migration
  state before manual acceptance, without exposing database credentials.
- Checklist progress is now 31/50 (62%). The prior combined history/audit item
  was split so the completed read models are not confused with the still-open
  cross-workflow audit-evidence view. That audit view is the next safe slice.

## Currently backend-connected HR pages

Local web base: `http://127.0.0.1:3000` (API: `http://127.0.0.1:4000/api/v1`).

- `/#/hr/org-structure` — shared live company hierarchy with governed child
  unit create/edit/status maintenance; legal-company creation remains under
  Platform administration.
- `/#/hr/designations` — live company-scoped designation catalogue with
  governed create/edit/status maintenance.
- `/#/hr/job-grades` — live company-scoped grade catalogue with governed
  create/edit/status maintenance, ordered grade levels and optional coherent
  compensation bands.
- `/#/hr/cost-centres` — live shared finance-dimension catalogue with governed
  create/edit/status maintenance; nominal-account mapping remains owned by
  Finance.
- `/#/hr/work-locations` — live location catalogue with a validated on-site,
  hybrid, remote or client-site working pattern.
- `/#/hr/employment-types` — live contractual-type catalogue with a validated
  payroll, stipend or accounts-payable route.
- `/#/hr/employee-categories` — live policy/reporting catalogue with a
  validated monthly, fortnightly, weekly or stipend cycle.
- `/#/hr/hr-dashboard` — live company-scoped workforce and action summary with
  drill-through to the governed People and organisation workspaces.
- `/#/hr/finance-payroll-dashboard` — live payroll coverage and control summary
  over salary assignments, payroll periods, results, journals and payments.
- `/#/hr/employees` — server-scoped employee directory with human-readable
  branch and department names and live record navigation; no prototype fallback.
- `/#/hr/employee-record/:employee-id` — permission-scoped employee overview
  backed by the employee detail projection, with links to governed related
  workspaces.
- `/#/hr/positions-org` — current effective workforce positions, department
  distribution and reporting lines with Employee Record drill-through.
- `/#/hr/attendance-corrections` — governed drafts, reporting-manager and HR
  reviews, immutable workflow/source evidence and protected daily attendance effects.
- `/#/hr/monthly-attendance` — live operational month summaries, employee
  calendar, dated daily-evidence links and separately authorized finalized inputs.
- `/#/hr/daily-attendance` — operational daily register, real evidence review,
  scoped search/pagination and connected shift assignments (read-only).
- `/#/hr/shift-assignments` — live allocation register, dated replacement /
  closing / cancellation, immutable history and effective employee shift preview.
- `/#/hr/shifts` — shared shift rules, protected history, work-site consistency,
  overnight/flexible arrangements and weekly rotation preview.
- `/#/hr/create-employee-from-offer` — accepted terms, employee draft handoff,
  approval progress, agreed assignment preparation and governed hire submission.
- `/#/hr/add-employee` — governed employee draft creation; API or permission
  failures show an explicit unavailable state and never substitute a mock form.
- `/#/hr/employee-drafts` — draft directory, detail, update and submission.
- `/#/hr/employee-approvals` — employee draft, Hire, Transfer, Promotion,
  manager-change, work-location-change and organization-placement-change
  checker queues and decisions.
- `/#/hr/employee-contacts` — governed email/phone contact history.
- `/#/hr/employee-emergency-contacts` — governed emergency contacts.
- `/#/hr/employee-documents` — restricted document metadata reads only.
- `/#/hr/employee-assignments` — profile context, Hire submission, assignment
  timeline, Transfer, assignment-only Promotion, manager-change and
  work-location-change plus organization-placement-change submission.
- `/#/hr/employee-status-history` — unified Employee History workspace with
  immutable status, lifecycle-event and non-sensitive profile-version reads.
- `/#/hr/lifecycle-policies` — policy directory, authoring, submission,
  independent approval and activation.
- `/#/hr/jobs` — company-scoped job catalogue and governed job creation.

This makes 34 of the 76 HR menu screens API-connected. The remaining 42 are
mock/prototype unless separately marked above. In Organisation & Masters,
all 8 screens are now API-connected: Organisation Structure, Designations, Job
Grades, Jobs, Cost Centres, Work Locations, Employment Types and Employee
Categories. All 13 People screens and all seven Recruitment screens are
now API-connected, including both dashboards, Employee Record and Positions &
Organisation. Shifts & Rules, Shift Assignments, Daily Attendance, Monthly Attendance and Attendance Corrections are the first five connected
Attendance & Shifts screens. Payroll calculation, approval, posting and payment workspaces
remain separate planned delivery slices even though their existing database
authorities feed the live dashboard.

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

## Resume handoff after Identity & Access completion — 2026-10-16

Identity implementation slices IA-01 through IA-06 are complete through
security migration 13. The final controlled browser sign-off remains pending
because the Windows browser helper could not initialize and the available
local credentials are not valid for the running Node API; this does not block
returning to isolated HR development.

Resume HR with the cross-workflow audit-evidence view identified after the
Employee History read-model slice. Preserve all current HR v33 migrations,
generated API contracts and working screens. Keep these known regression items
visible while working:

- the assignment timeline currently includes `reporting_manager_id` while one
  older test expects it to be absent;
- persistent shared fixtures can retain company grants, lifecycle policies and
  synthetic users across repeated integration runs, so new tests must create
  unique records or assert only their own IDs rather than deleting immutable
  evidence;
- manual maker/checker browser acceptance is still open for the completed HR
  assignment-change and Employee History surfaces.

Identity security is now a required dependency: HR mutations remain blocked
during impersonation, every request must preserve tenant/company scope, and
new HR administration must use the existing cookie session and exact
permission model rather than adding a parallel authentication path.

## Banking dependency handoff — 2026-10-19

The first governed Banking account foundation is now implemented through the
versioned API and PostgreSQL. It supplies the stable Bank Account identifier
required by `hr_payment_export_profile.finance_bank_account_id`, including
tenant/company scope, currency, lifecycle state and Chart of Accounts mapping.

Repository inspection found no live HR API, service, repository or frontend
mutation for creating or updating a payment export profile. The column exists
in HR migration `0020_governed_payroll_payment`, but it is not yet an active
business workflow. No speculative HR-to-Banking write path was added.

When the Phase 5 payroll payment-profile slice is implemented, its server-side
validation must resolve the selected Bank Account through the Banking boundary
and require all of the following before persistence:

- the same authenticated tenant and permitted company;
- an active Bank Account;
- the payroll/payment currency expected by the profile;
- a valid, active and postable Chart of Accounts mapping; and
- authorization and audit evidence for the HR payment-profile mutation.

HR must not update Banking master data or write accounting journals directly.
The next safe HR development slice remains the cross-workflow audit-evidence
view described above; the payroll-to-Banking consumer belongs to Phase 5.

## Global super-administrator approval override handoff — 2026-10-19

The cross-module override implementation is complete through Security 0014,
HR 0034 and Finance 0004. HR now uses the shared governed policy for employee
drafts, lifecycle-policy approval and activation, Hire, Transfer, Promotion,
manager changes, work-location changes and organization-placement changes.
Each accepted same-actor decision requires the active `super_administrator`
role, `platform.approval.override`, the normal workflow permission and a
business reason. The decision and immutable override evidence commit in one
database transaction. Ordinary maker/checker separation, company/tenant
scope, jurisdiction and hierarchy validation, and the impersonation mutation
block remain enforced.

Verification observed on 2026-10-19:

- contract: 9 focused assertions passed;
- frontend/unit: 33 focused assertions passed;
- fresh-database migration/integration: 23 focused assertions passed;
- database isolation/immutability: 2 assertions passed;
- full TypeScript check and production web build passed;
- the running API readiness endpoint reported all dependencies healthy; and
- a fresh web login authenticated `shoaib` as `super_administrator` with all
  246 active permissions including `platform.approval.override`.

The live HR routes `/#/hr/employee-approvals` and
`/#/hr/lifecycle-policies` rendered through the authenticated web shell. The
employee approval page received HTTP 200 responses from employee-draft, Hire,
Transfer, Promotion, manager, work-location and organization-placement review
endpoints. The lifecycle page received HTTP 200 from the lifecycle-policy
endpoint.

The remaining acceptance gate is a controlled synthetic UI mutation run:
self-decide representative HR, Identity and Bank Account records as `shoaib`,
inspect the domain event, platform audit and immutable override event, then
repeat an ordinary-maker denial. Automated PostgreSQL integration tests cover
these transaction and denial rules, but the destructive browser decision run
has not been claimed as completed.

The Bank Payments acceptance gate is now complete. Its list, entry and
persisted transaction-detail routes use the versioned Banking API, PostgreSQL
and the shared Finance posting service through Platform 0008, Security 0015 and
Finance 0007. Chromium verified distinct maker/checker/poster actions,
compensating reversal, restricted denial and the governed `shoaib`
self-approval override. No HR mutation or direct HR-to-Banking write path was
added.

The Bank Receipts acceptance gate is also complete through Finance 0008. Its
list, multi-line entry and persisted detail routes use the same versioned
Banking API boundary, PostgreSQL authority and Finance posting service.
Chromium and read-only database evidence verified maker/checker/poster
separation, reload persistence, debit-Bank/credit-nominal posting, linked
compensating reversal, restricted denial and the governed `shoaib` approval
override. Receipt delivery added no HR mutation and no direct HR-to-Banking or
HR-to-ledger write path.

Resume HR at the cross-workflow audit-evidence view already identified above.
The next Banking slice is Bank Receipts; payroll-to-Banking consumption remains
deferred to the HR Phase 5 governed payment-profile/payment-batch work.


## Accepted offer employee handoff verification

- Additive HR migration 0043 preserves offer, candidate, application and employee
  links with uniqueness, tenant RLS and immutable handoff evidence.
- Six new integration cases cover permissions/company/tenant scope, strict HTTP
  validation, CSRF/origin, acceptance/version gates, atomic concurrent retries,
  duplicate identities/numbers, immutable evidence and the complete governed hire.
- Offer, handoff and governed-hire suites: 16 tests passed. HR router unit suite:
  36 passed. Typecheck, API/client parity, catalogue parity, production web build
  and git diff whitespace checks passed.
- Populated Chromium acceptance used synthetic records against isolated PostgreSQL
  and the real API: draft creation, governed profile approval, exact assignment,
  hire submission and governed hire approval passed. Authorized super-admin
  overrides were explicitly reasoned and audited; independent checker decisions
  are covered by repository integration tests. Light/dark at 1440px and 390px
  passed without page overflow or browser errors. Calendar dates are returned as
  SQL DATE text to prevent timezone shifts in profile and assignment handoffs.
- No legacy CSS was removed. Next menu screen: Shifts & Rules. These counts track
  API-connected menu screens, not overall production readiness of HR/payroll.


## Shifts & Rules verification

- HR migration 0044 extends the existing shift authority with version, timezone,
  work-site, required-work and rotation-anchor metadata. Immutable rule events
  use forced tenant RLS. Database guards protect referenced rules, break/cycle
  children and current/future allocation; legacy shifts require configuration
  before new assignment. Existing employment and payroll records stay intact.
- Nine shift integration cases passed, covering scoped permissions and company
  options, validation, leaf types, paid/unpaid breaks, safe concurrent retries,
  stale edits, immutable evidence, anchored rotation, allocation locks, legacy
  configuration, work-location dependencies and HTTP authentication/CSRF/origin.
- Shift plus HR foundation integration suites: 27 passed. HR router unit suite:
  36 passed. The foundation timeline test now checks the current shared contract
  and excludes private fields; its lifecycle activation case uses a fresh company
  fixture and revokes temporary access rather than colliding with an active policy.
- Authenticated Chromium with synthetic records and the isolated real API passed
  create/edit, refresh-preserved draft, paid break, overnight schedule, deactivate /
  reactivate, rotation date preview, protected-reference errors and copying. Light
  and dark screenshots passed at 1440px and 390px without page overflow or browser
  errors. Typecheck, API/catalogue parity, production build and whitespace checks
  passed. No legacy CSS was retired.
- Next menu slice: Shift Assignments. Daily/monthly attendance, corrections,
  overtime decisions, period close and payroll input workspaces remain separate
  planned deliveries; a live configuration screen does not imply they are live.


## Shift Assignments verification

- HR migration 0045 adds allocation versions, human-readable references, retained
  cancellation/replacement links and immutable events with forced tenant RLS.
  Historical inactive shifts survive metadata backfill. Partial exclusion/unique
  constraints prevent overlapping non-cancelled allocation; cancelled records
  retain their evidence without blocking a new interval. Root shift availability
  ignores cancelled allocations while its historical rule protection remains.
- Organisation scope, complete approved employment coverage, matching employee
  site, configured shifts and locked attendance are enforced at the API/database
  boundary. Allocation and attendance-period state writes share a company lock.
  Dates return SQL DATE text, avoiding timezone shifts in intervals and previews.
- Ten allocation cases plus the existing shift/foundation suites: 37 integration
  tests passed. HR router suite: 36 unit tests passed. Coverage includes scope,
  retries, explicit replacement atomicity, cancellation/closing, immutable
  evidence, priority/fallback, rotation, full employment/site validation, locked
  periods, organisation availability and HTTP cookie/CSRF/origin/schema controls.
- Authenticated Chromium on isolated synthetic records passed branch/department/
  employee allocation, refresh-preserved draft, dated replacement, unstarted
  cancellation, prospective close, dated priority/fallback preview, related
  history navigation and navigation to/from Shifts & Rules. Light and dark
  layouts passed at 1440px and 390px with no page overflow or browser errors.
- Typecheck, generated API/catalogue parity, production build and whitespace
  checks passed. No legacy CSS was removed. Next menu screen: Daily Attendance.
  Attendance derivation, corrections, overtime approval, period close and payroll
  input screens remain separate deliveries; roster configuration alone is not
  attendance or payroll processing.


### Daily Attendance delivery

Delivered the live read-only Daily Attendance screen and documented
`GET /api/v1/hr/daily_attendance` through shared schemas and generated client.
The repeatable-read repository enforces attendance permission, tenant/company
access and dated operational placements. It batch-loads effective employee >
department > branch allocations and shares anchored weekly rotation selection
with the existing shift preview. PostgreSQL resolves shift windows in their
configured IANA timezone, including overnight endpoints.

Actual immutable punches are paired chronologically; duplicate, missing, future,
out-of-window or excessive evidence is flagged. Approved corrections supply
derived evidence without rewriting raw punches. Approved leave uses exact
per-day allocations; unavailable legacy allocations and conflicting attendance
require review. Branch/company non-optional holidays and weekly off days remain
separate from absence; unfinished shifts stay scheduled/in progress. Partial
leave remains explicit and overlapping work requires reconciliation. Unpaid
breaks are deducted after recorded gaps to avoid double deduction. Raw punch
details require the separate punch-read permission.

This is an operational view, including when its month is locked; it does not
replace a finalized payroll-input snapshot, ingest punches, approve corrections
or overtime, or perform posting. Extra minutes remain an indicator. Those
mutation workflows retain their independent permissions and future screens.

UI includes searchable bounded pages, current-page metrics, evidence review,
connected shift navigation, mobile cards and semantic light/dark styling.
No legacy CSS removed and no mock data fallback. Ten real-PostgreSQL attendance
tests, fifteen calculation/rotation unit tests, related HR regression suites,
authenticated browser actions at 1440px/390px in both themes, typecheck, API and
catalogue parity, production web build and whitespace checks passed.
A 50-employee local integration read used nine SQL statements including
transaction/security (same as one row) and took 23 ms; this is not a production
load benchmark. Existing HR migrations through 45 supply the tables; this
read-only slice requires no additional schema migration or audit mutation.

Progress: 32/76 menu screens API-connected (42.1%); 44 remain. This does not
measure overall production readiness. Next menu screen: Monthly Attendance,
reusing this daily derivation before separate corrections/overtime/period-close
workflows. Existing file-storage and independent two-user acceptance gates
remain as documented above.


### Monthly Attendance delivery

Delivered the read-only Monthly Attendance screen and documented
`GET /api/v1/hr/monthly_attendance`. Shared contracts, generated client and
HR catalogue are synchronized. Employee pagination occurs before expansion
into the selected month (25 default / 50 maximum, at most 31 dates each).
The shared batch reader now supplies both daily and monthly results in one
repeatable-read transaction per request. It retains company/tenant/attendance
permission checks, dated placement eligibility, roster precedence, weekly
rotation, IANA timezone windows, bounded punch evidence, approved corrections,
exact leave-day evidence and review flags. Monthly totals exclude dates without
an operational placement; future/in-progress shifts are not counted absent.
Fractional approved leave totals use integer ten-thousandths.

The employee calendar links to Daily Attendance with the authorized company,
date and employee search preserved. Operational totals stay separate from
immutable finalized input summaries; these are available only for a locked
month with the additional attendance payroll-input read permission. No raw
punch list, salary/bank data or source snapshot JSON is returned by the month
endpoint. Refresh does not write attendance, lock a period or post payroll.
Existing HR migrations through 45 supply this read model; no new schema or
audit mutation is required.

UI uses shared Tailwind/shadcn controls, explicit page-scoped metrics, desktop
table, mobile employee cards and a compact seven-column calendar with weekday
alignment, status legend, accessible day labels and selected-day details.
Attendance status/formatting presentation is shared with Daily Attendance.
Both themes were browser-tested at 1440px, 768px and 390px without page overflow
or browser errors. No legacy CSS was removed.

Verification passed: eight monthly and ten daily PostgreSQL integration tests,
54 focused monthly/daily/router unit tests, authenticated browser search/clear/
refresh/calendar/contextual drill-through, typecheck, generated API/catalogue
parity, production web build and git diff --check. A local 25-employee month
used eleven SQL statements including transaction/security (same as one employee)
and took 43 ms in integration; this is not a production-load benchmark. The
shared daily reader now also uses eleven statements after the common range
reader refactor; previous nine-statement measurements describe the earlier
implementation. Local API/web were restarted/rechecked against the current code.

Current progress: 33/76 HR menu screens API-connected (43.4%); 43 remain.
This is screen coverage, not overall HR production readiness or the historical
31/50 backend checklist. Next menu screen: Attendance Corrections, with maker/
checker decisions, immutable evidence, version/idempotency protection and
attendance-period locks maintained on the server.


### Attendance Corrections delivery

Delivered the live correction directory, bounded employee/date context, request
detail, draft create/update and submit/cancel/manager/HR decision endpoints.
Migration 46 adds version/reference fields, explicit governed-versus-legacy
identity, reporting route/subject snapshots, override references and immutable
request/source events. Existing legacy corrections remain visible and read-only;
existing raw punch and approved legacy attendance authorities are retained.
No historical request is silently upgraded into a new workflow.

Drafts belong to their requester. Submission captures the effective reporting
manager and current active user/company route. Manager approval is limited to
that routed user, followed by a separate HR decision. The subject employee,
requester, submitter and prior manager decision are included in actor-separation
checks, including current identity bindings added later. Explicit super-admin
self-decisions require the existing platform override permission, governed role
assignment validation, a deliberate UI confirmation and immutable override event.
There is no implicit role or missing-manager bypass.

All writes enforce tenant/company/action permissions, trusted origin/CSRF,
idempotency, optimistic versions, source-evidence freshness and the shared
attendance-period lock. Competing submitted/approved employee-day requests are
serialized and rejected. Corrected timestamps require an explicit matching UTC
offset for the effective shift timezone; out-of-window/future instants are
rejected. Submitted/approved candidates are evaluated by the same attendance
engine, so a missing-in/out correction cannot proceed while still leaving
unmatched punches. Only final HR approval contributes to daily/monthly results.
No raw punches are edited; overtime, period closing and payroll posting remain
separate workflows. Final requests and all new events are immutable.

UI uses shared Tailwind/shadcn controls, semantic theme colors, desktop tables,
mobile cards, date/time/UTC-offset forms, evidence summaries, server-derived
actions and audit history. Refresh preserves draft text. Native datetime inputs
were constrained after a tablet overflow was found. Light/dark details and the
editor were checked at 1440px, 768px and 390px. No legacy CSS removed.

Verification passed: 14 correction integration tests plus 18 daily/monthly
regressions (32 PostgreSQL tests), 58 focused contract/calculation/router unit
tests, generated API/catalogue parity, typecheck, production build and whitespace
checks. Integration verifies ordinary three-actor owner/manager/HR decisions,
all four correction types, source privacy/immutability, stale evidence/version,
concurrent submission, rejection/cancellation, locked months and real governed
overrides. Browser acceptance uses the real isolated API and an explicitly
audited super-admin manager/HR override path; it does not replace the separately
documented independent multi-user browser acceptance gate. Browser also proves
create/edit, draft-preserving refresh, cancellation, daily results, search and
responsive themes. Local migration/API/web were verified with the new code.

At the correction delivery checkpoint: 34/76 API-connected (44.7%); 42 remained. This is distinct
from overall HR production readiness and historical backend-checklist progress.
The next three attendance screens are delivered together in the section below.


### Connected attendance completion: Overtime, Period Close and Payroll Inputs

Overtime now has company/month/search pagination, effective employee/date evidence,
operational rule versioning, immutable draft terms, owner submission/cancellation,
routed manager approval/rejection, and separate HR approval/rejection. Manager
approval reviews the claimed minutes; HR may approve fewer minutes, never more
than requested, evidenced work or the effective daily cap. Holiday/weekend
categories derive from the effective attendance calendar. Regular overtime uses
the existing shift threshold. No eligible extra time becomes approved pay by
inference. Missing/invalid punch evidence, incomplete shifts, missing operational
rules and locked months block the workflow. Cancel and replace incorrect drafts;
legacy requests remain read-only. A successor closes a preceding open-ended rule
without changing its historical terms or excluding any referenced claim date.

Period Close opens the selected month, processes every operational employee in
stable batches of 25, and stores immutable review runs. Missing shifts, unresolved
punches, pending leave/correction/overtime (including drafts), conflicting source
allocations and unconfigured approved overtime become explicit exceptions. Only
completed months with no exceptions can enter final lock. An independent locker,
or the existing explicit governed super-admin override, rechecks the complete
source hash and creates all employee payroll inputs atomically. Version and
idempotency checks prevent duplicate locks and stale decisions. Advisory locks
also serialize direct punch/leave ingestion against review/lock. No employee is
silently skipped because a batch or display page is full. Processing is currently
synchronous and transactional; large-company load/worker sizing remains a
production acceptance gate, not a demonstrated performance guarantee.

Payroll Inputs reads immutable hr_payroll_input records created by the locked
period, rather than recalculating from today's sources. The attendance_close_v5
contract retains exact covered employment days, paid/unpaid days, approved and
unpaid leave, present/absent day counts, overtime minutes by category, correction
references and daily evidence hashes. Day arithmetic uses integer ten-thousandths.
Approved leave uses its exact per-day allocation and leave-type paid flag. An
unreconciled fractional leave day blocks close; it is not silently rounded into a
full day. Covered days mean the dates of operational employment in the month.
Legacy locked periods are preserved without inventing missing daily evidence.

These are attendance quantities, not a payroll calculation or payment release.
Existing monetary overtime policy/arrangement tables remain the later Payroll
authority. Payroll execution must explicitly accept and validate the v5 input
contract when its screens are delivered. Controlled post-lock adjustments,
reopening and money posting are separate future workflows; this section does not
change locked records, salary assignments, journals or payment batches.

Migrations 47–49 add governed overtime versions/routes/override references,
immutable completion history, review runs and v5 payroll evidence; strengthen
source serialization and exact leave-day locks; and protect successor rules.
All API writes use tenant/company/action authorization, CSRF/trusted origin,
idempotency, optimistic versions, immutable history and platform audit. Explicit
self-decisions use the existing governed-role override writer. API contracts,
OpenAPI/generated client, feature adapter, renderer and catalogue evolve together.

The three responsive Tailwind/shadcn screens share contextual company/month
navigation. Source attendance drill-through, employee/day traces, meaningful
loading/error/denied/empty states and semantic theme tokens are retained. Keyed
reads discard late responses from a previous filter. Refresh preserves typed
forms; changing company/month is disabled while editing. Decision forms retain
the reviewed version/hash so refresh cannot silently upgrade their approval.
No legacy CSS was removed.

Validation: 80 affected PostgreSQL integration tests and 68 focused unit tests
passed, including full three-actor approval, stale source/version rejection,
rule successors, frozen inputs, idempotent concurrent locks and a source writer
committing while lock waits. Real authenticated browser workflow passed for all
three screens, with ordinary manager routing exercised through an independent
fixture actor and explicit audited HR/period overrides in the browser. Independent
multi-user browser acceptance remains a separate production gate. Light/dark UI
was verified at 1440, 768 and 390 pixels without page overflow or browser errors.
Typecheck, focused ESLint, API/catalogue parity, production build and whitespace
checks passed. Local database is migrated through HR49; API 4000 and web 3000
serve the updated section. Browser writes used isolated synthetic records.

At the attendance completion checkpoint: **37/76 screens (48.7%); 39 remained**.
Attendance & Shifts is **8/8 API-connected**. These are screen counts, not a claim
that all HR/payroll business processes are production complete.

Next phase: deliver all six Time & Leave pages as one connected section: Leave
Types, Leave Balances, Attendance, Leave Requests, Add Leave Request and Leave
Approval. Reuse the operational attendance reader and shared approved leave/day/
ledger authorities. Preserve exact fractions, manager/HR separation, controlled
ledger changes, source freshness and the locked-month barriers delivered here.
Do not mark these six pages live before their own API/browser/build gates pass.


### Time & Leave connected delivery

Delivered all six Time & Leave menu screens together. The five new workspaces
share the established HR controls, while Attendance reuses the existing secured
daily reader and contextual employee/date drill-through. The source remains
hr_leave_type, hr_leave_policy_version, hr_leave_request, hr_leave_request_day and
the immutable hr_leave_transaction ledger; no parallel leave or attendance store
was introduced. Shared request/response schemas, OpenAPI/generated client, feature
adapter, independent API routes, renderer and live catalogue are synchronized.

Leave Types provides scoped search, creation, effective policy successors and
activation/deactivation. Codes and paid status are stable historical identity.
Policies cover entitlement/accrual metadata, carry/balance caps, request limits,
employee categories, document thresholds and manager-only versus manager/HR
approval. Successors cannot remove dates already referenced by existing requests.
Verified document metadata requires document-read permission and employee scope.
Existing gender-restricted legacy policies are explicitly blocked when verified
employee gender authority is absent; no eligibility is guessed from names or
documents. Adding that verified profile authority is a separate production
extension, rather than a silently bypassed restriction.

Leave Balances shows posted opening/accrual/carry/adjustment/expiry/usage totals,
pending reservations, approved future usage and spendable days. The ledger has
bounded history, stable source references and immutable entries. Authorized
operators can post opening balances, accrual, carry-forward, adjustments and
expiry with reasons, policy evidence, exact quantities and fresh balance hashes.
Opening balances and identical source-period policy postings cannot duplicate;
annual accrual and carry/balance limits are enforced. Deduction postings cannot
consume reserved or future-approved leave. Credits are not posted in the future.
Entitlement and cycle postings are deliberate operator actions in this delivery;
saving a policy does not credit balances, and recurring accrual/carry/expiry jobs
are not claimed as delivered automation. Existing automation metadata is retained.

Requests have bounded search/status registers, exact per-day full/first-half/
second-half allocations and a calendar derived from approved placements, effective
shifts and company/branch holidays. Non-working days are not charged. Calendar
dates need one effective placement and one consistent reporting route. Policy
eligibility, request limits, supporting evidence, scope, source freshness,
overlapping requests and available paid balance are checked on the server.
Unpaid leave enforces policy/approval controls without inventing paid entitlement.
Draft terms are immutable: cancel and replace an incorrect draft. Search options
and typed form state remain separate from approval evidence.

Submission reserves paid days without posting usage. The routed active manager
decides next, followed by independent HR when the frozen policy requires it.
Manager-only policies can finalize at that stage. Final approval and one exact
used ledger entry per charged date commit atomically. Rejection or cancellation
before approval releases the reservation without inventing ledger movements.
Company locking prevents concurrent submissions from overspending one balance.
Requester, subject identities and prior decision actors participate in separation
checks, including current identity bindings. Explicit super-admin decisions use
the existing governed-role override writer and immutable override evidence.

Approved leave cancellation requires cancellation permission plus independent HR
approval authority, or the explicit governed override. It preserves original
manager/HR decisions and posts exact positive reversing entries for the original
usage. The source request and each reversing ledger entry commit together. A
placement end/transfer does not strand a cancellation: original usage scope is
verified against immutable entries instead of assuming today's placement still
matches. Locked attendance dates still prohibit the cancellation. Legacy requests
remain read-only; no historical record is silently upgraded to the new workflow.

Attendance and period close consume these same approved allocations. Explicit
half-day evidence is validated against the scheduled shift midpoint, including
overnight/timezone windows. Unpaid breaks are prorated for the worked half, and
lateness/completion use the remaining working window. Full leave overlapping work,
ambiguous legacy fractions, insufficient half-day work or unreconciled punches
require review. Finalized payroll inputs retain exact paid/unpaid leave and
worked/absent fractions. Correction candidate validation now retains the approved
leave portion, allowing missing punches on a half-day to be resolved correctly.
The shared attendance eligibility predicate also retains closed placement segments
within their actual effective dates after a movement; profile drafts/cancelled
segments remain excluded.

Tenant/company/action permissions, origin/CSRF, optimistic versions, evidence
hashes, idempotency, transactional history and platform audit protect every write.
Employee company/date scope is checked before exposing bindings, balance or
document metadata. Archived request context is limited to its original authority.
Migrations 50–53 add governed leave fields, exact portions/paid snapshots,
immutable final-usage/reversal constraints and source-scope guards. Existing
punches, attendance inputs, payroll results and leave ledger rows are preserved.

The UI uses shared Tailwind/shadcn controls, semantic light/dark tokens, responsive
cards and grids, stable labels, explicit confirmations and per-employee/day
drill-through. Native date controls fit narrow columns; native fieldset borders
were removed and control typography normalized. Request/policy/decision forms
retain typed text during refresh; company/date changes are disabled while editing.
Decisions retain the reviewed version/hash instead of silently adopting a newer
request. Keyed readers discard stale responses. Type and balance lists use bulk
policy/ledger loading with pagination. No legacy CSS or existing working screens
were removed.

Validation passed: 96 affected PostgreSQL integration tests and 75 focused unit
tests, including normal manager/HR and manager-only approval, concurrent balance
reservation, source/version/idempotency checks, company isolation, verified
documents, exact fractions, immutable usage/reversals, locked periods, correction
on approved half-leave and cancellation after a placement ends. Browser acceptance
exercised policy creation, opening credit, full/half-day draft and submission,
independent fixture manager review, explicit real HR override, linked attendance,
approved cancellation/reversal and the approval queue. Independent multi-user
browser sign-in acceptance remains a separate production gate; the fixture manager
used the same repository workflow rather than a second signed-in browser user.
All six screens were checked in light/dark at 1440/768/390/320 pixels without page
overflow or browser errors. Final browser reads verify Live labels and reject
unauthenticated/missing-CSRF requests. Typecheck, focused ESLint, production web
build, API/catalogue parity and whitespace checks passed. Local database is through
HR53, with web 3000/API 4000 running current code. Browser writes used isolated
synthetic records; local business records were not seeded or replaced.

Current HR screen coverage: **43/76 API-connected (56.6%); 33 remain prototype**.
Time & Leave is **6/6 API-connected**, alongside Attendance & Shifts at **8/8**.
Screen connection coverage is distinct from complete HR production readiness.

Next phase: the ten Payroll menu pages as a connected delivery, beginning with
Pay Components and Salary Structures, then Salary Revisions, Payroll Inputs,
Payroll Runs, Payroll Review & Approval, Loans & Advances, Payroll Journal,
Payment Batch and Payslips & Payment Handoff. Consume locked attendance_close_v5
inputs and the real compensation/monetary overtime authorities. Preserve
jurisdiction/configuration gates, independent approvals, decimal money arithmetic,
immutable results, posting/payment authority and Finance handoff; operational
attendance or an old quantity multiplier must not substitute for pay policy.


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


## 2026-10-22 — Payroll correction return and retained-run review (Banking deferred)

Inspection found two remaining In-progress menu screens: Payroll Runs and Payroll Review & Approval. Payment Batch is the one separate Read-only Banking dependency. These statuses are retained: this delivery completes the pre-approval correction/review workflow, not the remaining advanced Payroll scope.

The old Return for corrections transition left a period Calculated, while Payroll input and salary safeguards forbid changes in a calculated period. Return now moves an independently reviewed, unapproved period to Open, clears its submission fingerprint, preserves the existing run number and immutable original employee results, and retains the review actor/reason in history. Makers can correct and independently approve the required inputs, then calculate the next immutable run. Pending inputs still block calculation; an Open returned period cannot resubmit an earlier result. Final approval consumes inputs only from the newly reviewed calculation. Locked attendance, approved/posted Payroll, journal provenance and historical payslips remain protected. This is a pre-approval correction flow; it does not implement general posted-Payroll reversals or retroactive attendance reopening.

HR124 is additive. HR125 additionally preserves the exact inherited paid-state and Finance proposal guards, verified against HR73 without enabling Banking integration. Together they retain the prior Finance posting transitions, guards the identity/version/run of a correction return, and requires a matching immutable return event through a deferred constraint trigger. A direct database reopen without that event fails. Current normalized company approval/result grants are checked before return/approval command replay. The screen uses the same actor-separation evaluator as the command: only the maker/calculator can submit; forbidden self-decisions are unavailable; an authorized administrator self-decision still requires the existing explicit audited override.

GET /api/v1/hr/payroll_runs/comparison is documented in shared contracts/OpenAPI and generated clients. It requires current company-scoped period and result read authority plus explicit company access, uses a repeatable-read tenant transaction, and sends no-store. It compares the current run with any earlier retained revision of that same period, rejects stale current-run numbers and invalid baselines, bounds source reads to 500 employees per run and returned pages to 50, and supplies the latest 50 revision choices. Exact shared decimal arithmetic computes totals/differences without floating point. Changed amounts, changed evidence with unchanged money, added/removed employees and unchanged results are separate categories. Filters/pagination retain full-run totals. The comparison exposes retained result/attendance fingerprints and current employee-directory labels. Original calculations are separate from later settlement supplements; comparison creates no decisions, journal entries or payment facts.

Both Payroll screens share the semantic-token/Tailwind comparison component. Responsive cards keep earlier/current/change amounts readable; revision/filter controls, empty/error/loading states, full totals, fingerprint drilldown, pagination, returned-period guidance and actor-specific actions use shared controls and global typography. Approved totals no longer carry a preliminary-calculation hint. No feature CSS or fixed palette/font was introduced.

Verification: 59 Payroll integration checks pass across correction/review (12 new), run lifecycle (20), statutory execution, Finance accrual and payslips; 58 focused API/calculation checks pass (117 distinct automated checks). They cover real correction/input approval, forced recalculation, immutable originals, currency rounding, large exact amounts, evidence-only changes, filtering/pages, stale selections, unauthorized companies, normalized-grant revocation before replay and direct-SQL return provenance. Full typecheck, focused ESLint, generated API/catalogue parity, production Next build, theme write/check and diff whitespace checks pass. Existing unrelated legacy files were not presented as a clean full-repository lint run.

Chrome uses separate maker/reviewer sessions against the isolated API and the normal production statutory executor with an artificial production-classification arithmetic pack (test data only; no legal rates or normal-company Payroll facts). It performs calculation, submission, forbidden maker self-review, independent return, actual approved one-off correction, recalculation, exact retained-run comparison, resubmission and independent final approval. Both themes pass root/workspace overflow and global font assertions at 1440/768/390/320. Narrow screenshots were inspected. Artifacts: D:/Xyric Work/ERP_Nexora/tmp/recovered-hr-work/payroll-review-phase/browser-result.json and corresponding PNGs. Theme audit: 79 feature views, 0 font exceptions, 5 existing direct color-exception views (6.33%); 232 application source files. These are source-file measures, not screen-completion percentages.

Normal rollout applies additive HR124–125, verifies forced tenant RLS and a non-superuser/non-BYPASSRLS API runtime, restarts the compiled API on 4000 and keeps web on 3000. Read-only browser smoke verifies populated company lists, both connected Payroll screens, private comparison route registration/no-store, authorized empty-period handling, unassigned-company 403 and anonymous 401. Acceptance writes are isolated. The temporary isolated API is stopped after verification.

Remaining non-Banking work: within-period statutory/context segmentation and scope-aware override execution, governed required accounting-dimension allocations, non-parity foreign-loan carrying-value/FX allocations, and general posted-Payroll correction/reversal scenarios beyond the delivered settlement supplements. Required legal pack publication and company setup remain actual operational prerequisites. Payment Batch linking/confirmation waits for the Banking owner's handoff. No menu status is promoted or percentage invented. Existing Banking/Finance posting diffs are preserved at 64/42 and 17/7 lines respectively.


## 2026-10-22 — Dated statutory contexts, explicit allocation and sealed evidence

Payroll previously stopped when a placement, published rule version or employee declaration changed within the earned period. The stable path remains compatible; when a full-period context cannot be resolved, a bounded dated resolver checks effective boundaries from legal profiles, Payroll configuration, operational placements/work-location profiles, activated packs/rules, declarations, parameters and overrides. Every earned day must resolve under authoritative company sources. Active, ended and legacy operational histories are included; draft/cancelled placements do not drive statutory calculations. An unsupported context or gap blocks the complete statutory result and final approval; no partial statutory output is sealed.

Identical rule versions with identical used monthly inputs execute once across their retained contexts. This avoids multiplying monthly tax/credits solely because an employee transfers or evidence is revised. Changing rule coverage or used inputs requires the configuration option context_basis=calendar_weighted_monthly. This is an explicit publisher choice, not an inferred country rule: allocate the unrounded monthly formula result by covered earned calendar days / total earned calendar days, then apply the reviewed rule precision/rounding. Calendar coverage is based on actual earned days, including employees with fewer earned days than a full month. Partial monthly intermediate amounts may exceed net pay; final net-pay safety is checked after allocation, before any approval. Negative rule outputs remain forbidden. Existing rules/constants keep their previous interpretation; newly introduced context variables cannot silently alter a rule without the declared policy.

Rule publication requires reviewed full and partial-period vectors carrying CONTEXT_DAYS and EARNED_PERIOD_DAYS. Allocation variables cannot appear in the formula/applicability and cannot be replaced by constants under this policy, preventing weighting twice. Two independently reviewed/released production-classification artificial pack versions exercise the real publisher and normal executor in isolated acceptance. No legal rates or normal-company rule packs are invented or deployed.

Immutable output evidence groups contexts by rule version and referenced inputs, rounds each such allocation once, then aggregates repeated rule versions into the existing unique snapshot rule/line identities. Snapshots use resolver dated_statutory_context_v1 and retain dated legal-profile/location/pack fingerprints, allocation inputs, monthly bases and actual allocated amounts. The existing safe_formula_v1 language/engine remains compatible with Payroll approval, Finance journal posting, payslip publication and correction readers. Header context metadata distinguishes the dated resolver without rewriting prior stable snapshots.

HR126–127 are additive deferred evidence guards. They require sealed company/employee source authority, complete non-overlapping frozen-day coverage, valid dated placement/location/profile references, retained pack references, non-empty allocation groups, published partial-allocation policy, rule effective dates, non-duplicated group contexts and exact reconciliation of allocated amounts/applicability with output lines. Missing group metadata or overlapped evidence injected during calculation causes the entire result/period/audit transaction to roll back. Historical snapshots and amounts remain immutable. No Banking or Finance posting source is changed.

The existing settlement-correction reader now replays every frozen context group, including changed declaration values and each group’s YTD provenance, then restores unique retained rule/line identities. It retains original context evidence and records corrected inputs/sources separately. No-op replay, changed input amounts, successive corrections, YTD carry-forward replay and missing evidence have explicit regression coverage. General posted-Payroll correction/reversal workflows remain separate scope.

Payroll Runs and Review & Approval show dated context periods inside each employee’s statutory evidence, with retained fingerprints and clear allocation behavior. Pay Components → Statutory company & employee setup → Rule publishing documents the optional policy and required reviewed vector inputs. All interactive UI uses shared controls, semantic Tailwind/token colors and global typography; the source audit remains 0/79 direct view font exceptions and 5/79 existing color-exception views (6.33%), across 232 application source files. These are source-file measures, not menu-screen coverage.

Verification: 86 distinct integration cases pass across dated contexts (14), existing Payroll runs/review/statutory/Finance/payslip flows, rule publishing and six existing settlement country/correction integration cases. They include real publication of two effective pack versions, placement and declaration changes, unchanged-value revisions, explicit-policy rejection, exact before-rounding allocation, independent approval, immutable recalculation, production-versus-synthetic separation, actual independent Finance posting and transaction rollback after injected evidence faults. 137 focused unit/API/calculation cases pass (223 distinct automated checks total). Full typecheck, focused ESLint, generated API/catalogue parity, production Next build, theme write/check and diff whitespace checks pass; this is not a claim of clean full-repository legacy lint.

Chrome uses separate authorized maker/reviewer sessions, two actually reviewed/published artificial production-classification pack versions and the normal production executor. It verifies dated evidence, independent return, approved one-off correction, recalculation, exact revision comparison, resubmission/final approval and the authorized publisher’s rule-authoring guidance. Existing employment authority and publisher permissions remain enforced. Light/dark at 1440/768/390/320 have no root/workspace/dialog horizontal overflow or JavaScript errors and inherit global fonts. Screenshots are inspected; artifacts are D:/Xyric Work/ERP_Nexora/tmp/recovered-hr-work/statutory-context-phase/browser-result.json and associated PNGs.

Normal preflight permits only HR126–127, checks runtime privileges and forced tenant RLS, and applies no business seed data. The compiled normal API is restarted on 4000; the web stays on 3000. Normal read-only smoke verifies populated company lists, both Payroll routes/private API reads, no-store, unauthorized-company 403 and guest 401. The temporary isolated API is stopped after verification. Banking/Finance posting diffs remain 64/42 and 17/7 lines respectively.

Remaining: scope-aware employee-jurisdiction overrides and cross-branch legal/work-jurisdiction resolution remain blocked; this delivery does not silently invent their authority or implement every possible country allocation scheme. A different legal allocation basis needs its own reviewed executor/contract. Required accounting-dimension mappings, non-parity loan carrying-value/FX allocation and general posted-Payroll reversals/corrections beyond delivered settlement supplements remain separate work. Payment Batch linking/confirmation waits for the Banking owner. Payroll Runs and Review & Approval remain In progress; no full-module completion claim or percentage is promoted.


## Payroll journal whole-account cost centres — HR128

The previous dated statutory-context phase and its isolated browser-fixture correction are complete. The employment-approval prerequisite for new Payroll inputs remains enforced. No production authorization was relaxed for a test fixture.

Payroll Journal now supports an explicit, independently reviewed whole-account mapping for the canonical Finance dimension key `cost_center`. The preparation form lists required accounts and offers active company cost centres from the existing shared HR/Finance catalogue. A mapping assigns the entire grouped account balance, including both sides if present. It is never presented as an employee-level or proportional allocation. Source amounts, account roles and Finance conversion arithmetic remain unchanged; no new rate, currency, legal rule or balancing line is invented.

Only preparation accepts `cost_center_mappings`; duplicate/extra-account and unsupported shapes are rejected. The API checks current normalized Finance authority and explicit company access before idempotent replay. Preparation validates canonical active company-owned cost centres, retains their identities/labels with the immutable source evidence and stores dimensions on reviewed lines. Acceptance/posting re-resolve the authority and compare exact fingerprints. Deactivation, renaming, changed account requirements or other source changes block acceptance/posting; independent rejection remains available and a successor revision is required. Original reviewed labels remain visible even after a catalogue rename. Existing dimension-free proposal hashes and posting behavior are preserved.

Additive HR128 adds the immutable line dimension column and deferred constraints. Existing HR72 exact source/amount multiset checks stay intact. New checks require canonical company cost centres, unique supported mappings, exact mapping/line equality, all required dimension values and exact reviewed/posted Finance dimension multisets. Rollback-only isolated fault injection proves missing or mismatched dimensions fail at commit. No applied migration was edited, no Banking/Finance source file was changed, and no normal business fixture was seeded.

The catalogue is bounded to 500 options with literal escaped code/name search and an explicit truncation notice. UI uses shared Tailwind/shadcn controls, semantic light/dark tokens and the global sans font. Selected names survive filtered searches; company/month/posting-date controls remain fixed while a decision is under review. Required, empty, error, loading, focus and disabled states were checked.

Verification: 78 connected integration cases across journal, Payroll run/review, dated statutory contexts, payslips and settlement correction; 87 focused unit/API checks; full typecheck; focused ESLint; API/catalogue parity; production web build; theme write/check; and whitespace checks. Chrome completed preparation, independent acceptance and actual Finance posting against the normal production executor using artificial reviewed pack data in the isolated database. Both themes at 1440/768/390/320 px passed workspace/root overflow and global-font checks without page errors; preparation/review/posted screenshots were visually inspected. Normal API4000/web3000 smoke confirmed populated authorized companies, the new journal contract, no-store, unauthorized-company403 and guest401 without normal business mutations. Normal and isolated schemas are HR128.

Remaining Payroll scope is explicit: scoped employee jurisdiction overrides/cross-branch resolution, employee-level/proportional allocation or other dimension keys, non-parity foreign-loan carrying-value/FX allocation and general posted-Payroll reversal/correction workflows beyond delivered settlement supplements. Banking payment linking/confirmation remains with the other developer. Payroll Runs and Review remain In progress; no full Payroll completion claim or percentage is implied.


## Employee Payroll jurisdiction resolution and revocation — HR129–130

Pay Components → Statutory company & employee setup now includes Employee jurisdiction and Revoke jurisdiction override. A draft names an employee, approved operational placement, country/jurisdiction, published rule category, exact effective range, legal basis and supporting evidence. The shared draft/submit/independent-approve or reject workflow materializes the existing canonical override fact atomically. Current normalized setup/salary permissions and explicit company access are checked before replay. Maker and bound-employee self-review remain forbidden even with administrator override. No new tax rate is selected by the browser or seeded into normal companies.

An approved category override selects only that category's target jurisdiction and its ancestors. Unrelated categories retain their legal/work authority; published additive national/ancestor rules still apply once. Different same-country legal/work branches require explicit approved authority for every encountered category. Unknown, overlapping or unused category overrides, mismatched/expired placements, inactive/incomplete/cyclic reference chains, missing published dependencies, foreign context and missing declarations/parameters remain blocked. The existing declaration/contribution/YTD lookups use each selected rule's actual pack jurisdiction. Rule precedence, legal allocation laws and foreign withholding are never inferred.

The resolver retains canonical approval/legal evidence, category/placement/date scope and selected pack identity in stable or dated sealed snapshots and each applicable output's sources. Mid-month overrides share the dated executor: unchanged monthly rules execute once; partial rule coverage or changed used inputs requires published calendar-weighted monthly configuration and reviewed vectors. Continuous compatible activation/rule coverage across effective published versions is validated before authoring/approval. Every actual earned context is validated again during calculation. Open-ended setup validates its start; future earned periods still require effective published authority.

Revocation uses a separate immutable request and independent decision, retains the original exact range and updates the canonical fact without rewriting prior approvals or calculations. The original request still shows its historical approval and separately shows that its override record is revoked. New calculations use the remaining current setup. Pending or changed jurisdiction setup invalidates the calculated source fingerprint and removes submission availability until resolved/recalculated. An API check and additive database period guard also block stale submission/approval. Submitted, approved or finalized Payroll blocks retroactive setup/revocation and requires its owning correction workflow.

HR129 adds the two request kinds, native fact/request approval binding and deferred snapshot checks for complete canonical evidence, employee/category/date/placement authority and actual selected pack ancestry. Missing evidence and forged references fail at commit in rollback-only fault-injection tests. HR130 layers the stale-jurisdiction submission/approval guard onto existing Payroll transitions; inherited Finance and Banking guard functions were preserved. No applied migration was edited and no Banking or Finance posting source file was changed.

Verification: 110 connected integration cases across 12 files and 136 unit/API checks across 7 files (246 distinct checks). These cover override authorization/replay, maker and bound-subject denial, same-country branch selection, category isolation, mid-month policy requirements, continuous pack-version coverage, revocation, immutable evidence and actual scoped Payroll → independent Finance acceptance → General Ledger posting. Existing Payroll run/review, localization, statutory-context, cost-centre journal, payslip and settlement corrections pass. Full typecheck, focused ESLint, API/catalogue parity, theme write/check, production web build and whitespace checks pass. These are focused verification results, not a claim that unrelated full-repository lint is clean.

Chrome completed real draft/submit/independent approval, scoped calculation, independent revocation, explicit revoked status, blocked stale submission, recalculation and independent Payroll approval. Authoring/revocation dialogs and calculated/revoked evidence passed light/dark at 1440/768/390/320 px, root/workspace/dialog overflow and global-font checks with no page errors. Screenshots were inspected; legal basis uses the shared multiline control. The normal non-superuser/non-bypass API role, forced RLS, native IUD/function privileges and all three new guards were verified after applying HR129–130. Normal API4000/web3000 passed read-only smoke for both sections, populated companies, no-store, unauthorized-company403 and guest401. Only artificial reviewed packs and business fixtures in the isolated database were used for financial mutation tests; no normal business records were seeded or changed.

Remaining Payroll: employee-level/proportional cost allocations or other Finance dimension keys, non-parity loan carrying-value/FX allocation and general posted-Payroll reversal/correction workflows beyond settlement supplements. Cross-country contexts and other legal allocation bases require separately reviewed execution contracts. Published legal packs and actual company/employee setup remain operational prerequisites. Banking linking/confirmation waits for the other developer. Payroll Runs and Review remain In progress; no completion percentage or full-country-compliance claim is promoted.


## Payroll Runs and Review production-scope completion — 2026-10-22

Payroll Runs and Payroll Review & Approval are promoted from In progress to Live for their implemented, tested production boundary. Both routes use the dedicated API-backed workspace and preserve frozen attendance, governed compensation, exact calculation, published statutory evidence, dated jurisdiction context, retained-run comparison, correction return/recalculation, independent approval, immutable audit, Finance journal handoff and explicit error, empty and permission states. No prototype fallback or simulated financial success is available.

The promotion is deliberately scope-bounded. Employee-level or proportional accounting dimensions, non-parity foreign-loan carrying-value/FX allocation, general corrections after Payroll or Finance posting, cross-country execution and additional legal allocation bases remain unsupported and must fail closed or follow their owning correction workflow. Required company setup and reviewed legal packs remain operational prerequisites. Payment Batch stays Read-only until the separately owned Banking integration supplies governed linking and confirmation; no Banking or Finance source is changed by this status completion.

Verification for the completion decision: full TypeScript check; 109 focused Payroll unit, API and calculation checks; 67 database-backed Payroll run, review, journal and jurisdiction integration checks; production Next.js build; generated catalogue parity; required theme audit; and diff whitespace validation. Historical checkpoint text above remains evidence of the earlier delivery state; this section and the current checkpoint supersede its old menu labels.
The next candidate Banking slice is Bank Transfers and requires separate
approval. Payroll-to-Banking consumption remains deferred to the HR Phase 5
governed payment-profile/payment-batch work; that future server workflow may
consume Banking and Finance contracts but must not write Bank Account, receipt
or journal tables directly.
