# Governed Employee Manager Change Design

## Purpose

Deliver reporting-manager change as a production-backed, effective-dated
employee movement. An authorized maker proposes another eligible manager or an
explicitly unassigned reporting line, a different authorized checker approves
or rejects the request, and approval appends a new assignment segment without
rewriting history.

This slice changes only `reporting_manager_id`. It does not change company,
branch, department, job, designation, grade, cost centre, work location,
employment type, employee category, salary, or payroll. The existing Employee
Assignments and Employee Approvals workspaces remain the approved user-facing
surfaces.

## Existing Authority

The implementation reuses:

- relationship-bound, effective-dated assignments and immutable history;
- the existing `hr.employee_assignment.manager_change` maker permission and
  `hr.employee_assignment.change` checker permission;
- active company access, employee-directory and assignment projections;
- PostgreSQL safeguards that require an effective manager relationship in the
  same legal employer, reject self-reporting, and recursively reject reporting
  cycles;
- cookie sessions, CSRF/origin validation, idempotency, platform audit
  evidence, RLS, and standard problem responses; and
- the dedicated Hire, Transfer, and Promotion request/decision/projection
  patterns.

Manager eligibility remains a server and database decision. A browser option
does not grant authority or bypass effective-date validation.

## Chosen Approach

Create a dedicated manager-change request instead of expanding another
movement workflow or mutating an assignment directly. A pending request stores
the source assignment and a nullable proposed manager. Approval closes the
source assignment on the day before the effective date and creates one active
relationship-bound assignment with `change_reason = 'manager_change'` in the
same serializable transaction. Every non-manager assignment field is copied
from the locked source assignment by the server.

A nullable proposed manager is meaningful only when the source currently has
a manager. This supports top-level employees through an explicit reviewed
"No reporting manager" outcome. A request that preserves the current manager,
including null-to-null, is rejected.

## Contracts and API

Add versioned contracts and OpenAPI paths under `/api/v1/hr`:

1. `GET /manager_change_requests`
   - bounded pending queue scoped by `company_id`;
   - requires assignment-change checker permission and active company access;
   - returns review-safe employee, current/proposed manager, effective date,
     requester, reason, and state fields.
2. `POST /employees/{employeeId}/manager_change_requests`
   - requires manager-change maker permission;
   - accepts company and source-assignment identifiers, nullable proposed
     manager, today's effective date, and a required reason;
   - creates only a pending request plus audit and idempotency evidence.
3. `GET /employees/{employeeId}/manager_change_requests/{requestId}`
   - returns one company-scoped review projection without private employee or
     compensation data.
4. `POST /employees/{employeeId}/manager_change_requests/{requestId}/decision`
   - requires assignment-change checker permission;
   - accepts `approved` or `rejected` and a required reason;
   - enforces requester/checker separation.

The generated browser client and `HrApiClient` remain the only frontend data
boundary.

## Persistence and Transaction Rules

An additive HR migration creates `hr_employee_manager_change_request` with:

- tenant, company, employee, relationship, and source-assignment keys;
- a nullable proposed-manager key;
- an explicit boolean recording that a null proposal is intentional, so an
  omitted field cannot silently clear authority;
- pending/approved/rejected state and maker/checker evidence;
- the resulting assignment identity after approval;
- unique protection against multiple pending manager changes for one source
  assignment; and
- indexed company queue and employee history access.

The request contract requires exactly one intent: either an eligible
`reporting_manager_id` or `clear_reporting_manager = true`. PostgreSQL guards
repeat this rule, validate source authority and meaningful change, and protect
request evidence after decision.

Approval executes atomically in one serializable transaction:

1. lock and revalidate the pending request, relationship, and active source
   assignment;
2. verify company access, permission, independent checker, same-day effective
   date, and unchanged source authority;
3. when a manager is proposed, require their effective relationship in the
   same legal employer and re-run self/cycle protection;
4. close the source assignment at `effective_on - 1 day`;
5. insert a new active assignment with the proposed nullable manager and every
   other field copied from the source, using `change_reason = 'manager_change'`;
6. record decision and immutable audit evidence; and
7. persist the idempotent response.

Any failure rolls back all writes. Rejection records decision and audit
evidence without changing assignments. Future-dated manager changes remain
deferred until a durable activation worker exists.

## Frontend Workflow

Employee Assignments gains a separate Manager Change panel for eligible active
assignments. It shows the current reporting manager, loads server-authorized
active employees in the selected company, excludes the subject employee, and
allows either selecting a proposed manager or explicitly choosing "No reporting
manager." The form requires a reason, fixes the effective date to today, and
states that submission changes nothing until independent approval.

Employee Approvals gains a Manager Change Approvals section showing current
versus proposed reporting line, including a clear "No reporting manager"
label. Approval and rejection require a reason and confirmation. Successful
decisions refresh the queue and assignment timeline.

Both panels preserve loading, empty, validation, permission-denied, error,
success, and in-flight states. API failures never substitute fixture success.

## Security and Integrity

- Authenticate every route with the existing cookie session.
- Enforce tenant scope, active company access, and distinct maker/checker
  permissions on the server.
- Reject requester self-approval.
- Reject choosing the subject as their own manager.
- Reject unavailable, cross-company, ineffective, or cyclic reporting lines.
- Treat clearing the manager as an explicit audited action, never as a missing
  optional field.
- Require CSRF, allowed origin, bounded validation, idempotency, serializable
  writes, and standard non-leaking problem responses.
- Exclude compensation, private employee data, secrets, and infrastructure
  details from projections and errors.

## Payroll Isolation

The contract carries no salary or payroll fields. Approval must not insert,
update, or supersede `hr_salary_assignment` records. PostgreSQL integration
tests capture an employee's salary rows before and after approval and rejection
and prove they remain identical.

## Verification

Contract, OpenAPI, router, service, and generated-client tests cover validation,
nullable-clear intent, authorization delegation, query serialization,
idempotency headers, and standard errors. PostgreSQL integration tests prove:

- create, replay, conflicting replay, and duplicate-pending behavior;
- tenant/company scope and requester/checker separation;
- change to another effective same-company manager;
- explicit manager clearing;
- self-manager, unavailable-manager, and reporting-cycle rejection;
- atomic approval projection and rejection non-projection;
- preservation of every non-manager assignment dimension; and
- unchanged salary-assignment rows.

Completion also requires migration verification, type checking, API checks,
focused lint, a production web build, and authenticated browser acceptance of
both live panels. A real two-user decision remains a manual acceptance gate if
only one local account is available.

## Completion Boundary

The phase is complete when request, queue, review, independent decision,
assignment projection, explicit-clear behavior, cycle protection, payroll
isolation, audit evidence, automated tests, live UI integration, and delivery-
plan handoff are present. Organization, work-location, cost-centre, and other
movement types remain separate later slices.
