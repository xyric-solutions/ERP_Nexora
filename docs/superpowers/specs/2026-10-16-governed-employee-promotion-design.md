# Governed Employee Promotion Design

## Purpose

Deliver Promotion as a production-backed, effective-dated employee movement.
An authorized maker proposes a change to an active employee's job,
designation, or job grade; a different authorized user approves or rejects the
request; and approval appends a new assignment segment without rewriting
history.

This slice does not change salary, payroll, branch, department, manager, work
location, employment type, employee category, or cost centre. Salary revision
is a separate governed workflow and must exist before a promotion can carry a
compensation change. The existing Employee Assignments and Employee Approvals
workspaces remain the approved user-facing surfaces.

## Existing Authority

The implementation reuses:

- relationship-bound, effective-dated assignments and their database guards;
- active company, job, designation, and job-grade master records;
- session authentication, company access, CSRF/origin validation,
  idempotency, platform audit evidence, and standard problem responses;
- the dedicated Hire and Transfer request/decision/projection patterns; and
- the typed HR contract, OpenAPI, generated client, and feature-level client
  boundaries.

The production database contains salary-assignment tables, but there is no
production salary-revision API or approved browser workflow. Promotion must
therefore neither create nor mutate salary records.

## Chosen Approach

Create a dedicated Promotion request rather than expanding Transfer or adding
a generic movement engine. A pending request stores the source assignment and
the proposed job, designation, and job grade. Approval closes the source
assignment on the day before the effective date and creates one active
relationship-bound assignment with `change_reason = 'promotion'` in the same
serializable transaction. All other assignment dimensions are copied from the
locked source assignment by the server.

At least one of job, designation, or job grade must change. Rejection records
decision and audit evidence but changes neither assignments nor salary.

The existing `hr.employee_assignment.change` permission authorizes both
request and decision operations. This avoids introducing an ungranted
permission that would make the live workflow inaccessible. Actor-level
maker/checker separation remains mandatory: the requester can never decide
their own request. A future authorization review may split Promotion maker and
checker permissions through the governed role-policy workflow.

## Contracts and API

Add versioned contracts and OpenAPI paths under `/api/v1/hr`:

1. `GET /promotion_requests`
   - bounded pending queue scoped by `company_id`;
   - requires assignment-change permission and active company access;
   - returns only review-safe employee, current/proposed role, requester,
     effective date, reason, and state fields.
2. `POST /employees/{employeeId}/promotion_requests`
   - accepts company and source-assignment identifiers, proposed job,
     designation and job-grade identifiers, today's effective date, and a
     required reason;
   - creates only a pending request plus audit and idempotency evidence.
3. `GET /employees/{employeeId}/promotion_requests/{requestId}`
   - returns one company-scoped review projection without private employee or
     salary data.
4. `POST /employees/{employeeId}/promotion_requests/{requestId}/decision`
   - accepts `approved` or `rejected` and a required reason;
   - enforces independent decision authority.

The generated browser client and `HrApiClient` remain the only frontend data
boundary.

## Persistence and Transaction Rules

An additive HR migration creates `hr_employee_promotion_request` with:

- tenant, company, employee, relationship, and source-assignment keys;
- proposed job, designation, and job-grade keys;
- pending/approved/rejected state and maker/checker evidence;
- the resulting assignment identity after approval;
- unique protection against multiple pending promotions for one source
  assignment; and
- indexed company queue and employee history access.

Database constraints and triggers validate tenant/company scope, active and
correctly typed masters, source-assignment context, meaningful change, and
decision immutability. The request cannot update employee, assignment, or
salary projections directly.

Approval must execute atomically in one serializable transaction:

1. lock and revalidate the pending request and current source assignment;
2. verify company access, permission, independent checker, active employment
   relationship, active masters, and unchanged source context;
3. require the effective date to equal the database current date and be later
   than the source assignment's start date;
4. close the source segment at `effective_on - 1 day`;
5. insert a new active assignment using the proposed role fields and every
   other field copied from the source, with `change_reason = 'promotion'`;
6. record decision and immutable audit evidence; and
7. persist the idempotent response.

Any failure rolls back all writes. Future-dated Promotion remains deferred
until a durable activation worker can switch assignments without an authority
gap.

## Payroll Isolation

The request and response carry no salary amount, structure, component, or
salary-assignment identifier. Promotion approval must not insert, update, or
supersede `hr_salary_assignment` records. PostgreSQL integration tests capture
the employee's salary rows before and after both approval and rejection and
prove they are unchanged.

The UI states: "Promotion changes assignment role details only. Compensation
requires a separately approved salary revision." If future requirements demand
a pay-changing Promotion, effectiveness must be blocked until a same-employee,
same-effective-date salary revision is approved through its own production
workflow, matching the prototype rule.

## Frontend Workflow

Employee Assignments gains a separate Promotion panel for eligible active
assignments. It pre-fills current job, designation, and grade, offers only
server-authorized active masters, requires at least one changed value and a
reason, fixes the effective date to today, and explains the salary boundary.

Employee Approvals gains a Promotion Approvals section showing current versus
proposed role details. Approve and reject actions require a reason and explicit
confirmation. Successful decisions refresh the queue and assignment timeline.

Both panels preserve loading, empty, validation, permission-denied, error,
success, and in-flight states. API failures never substitute fixture success.

## Security and Integrity

- Authenticate every route with the existing cookie session.
- Enforce tenant scope, active company access, and assignment-change
  permission on the server.
- Reject self-approval even when the actor has every relevant permission.
- Require CSRF, allowed origin, bounded validation, idempotency, serializable
  writes, and standard problem responses.
- Exclude compensation, private employee fields, secrets, and infrastructure
  details from Promotion projections and error messages.
- Keep PostgreSQL assignment, relationship, master-data, overlap, RLS, and
  audit constraints as final integrity authorities.

## Verification

Contract, OpenAPI, router, service, and generated-client tests cover validation,
authorization delegation, serialization, idempotency headers, and standard
errors. PostgreSQL integration tests prove replay/conflict behavior,
duplicate-pending rejection, company isolation, self-approval denial,
meaningful-change validation, atomic approval projection, rejection
non-projection, immutable history, and salary-row non-mutation.

Completion also requires migration verification, type checking, API checks,
focused lint, a production web build, and authenticated browser acceptance of
the live maker and checker panels. A real two-user decision remains a manual
acceptance gate if only one local account is available.

## Completion Boundary

The phase is complete when Promotion request, queue, review, independent
decision, assignment projection, payroll isolation, audit evidence, automated
tests, live UI integration, and delivery-plan handoff are present. Manager and
organization changes remain separate later slices with their existing
dedicated permissions and validation rules.
