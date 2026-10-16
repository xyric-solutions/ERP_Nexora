# Governed Employee Hire Completion Design

## Purpose

Complete the partially delivered governed employee Hire workflow as one
production-backed vertical slice. The implementation must preserve the approved
HR navigation and presentation, reuse the existing `/api/v1/hr` boundary, and
prove the workflow from the browser through PostgreSQL.

This slice ends when an authorized maker can prepare and submit a Hire request,
an independent checker can approve or reject it, and the resulting database and
audit effects are verified. Recruitment, onboarding, employee movements,
attendance, leave, payroll, document upload, and other later HR phases remain
out of scope.

## Current Baseline

The repository already contains:

- HR schema migrations through version 26, applied to the isolated development
  database;
- approved employee drafts and profile-draft assignment APIs;
- company-scoped active jobs and lifecycle policies;
- Hire request creation and independent decision contracts, OpenAPI paths,
  generated-client methods, repository methods, and mutation routes;
- serializable transactions, idempotency, company access, permission checks,
  maker/checker separation, and platform audit writes for Hire mutations; and
- existing Employee Assignments and Employee Approvals workspaces that must be
  retained as the user-facing surfaces.

The missing production capability is a discoverable, company-scoped pending
Hire queue, complete frontend orchestration, and real PostgreSQL integration
evidence for approval and rejection.

## Chosen Approach

Extend the existing Employee Assignments and Employee Approvals workspaces
instead of introducing another HR navigation entry.

- Employee Assignments is the maker surface for profile-draft preparation and
  Hire request submission.
- Employee Approvals is the checker surface for pending Hire review and
  decisions.
- The existing prototype terminology, hierarchy, tables, form controls, loading
  states, empty states, and responsive behavior remain the visual contract.
- Mock records must never be shown as live Hire requests. API failure produces
  an explicit unavailable/error state.

## Architecture and Boundaries

The dependency flow remains:

```text
HR workspace -> HrApiClient -> generated Nexora API client -> /api/v1/hr
             -> authenticated HR router -> SourceHrRepository -> PostgreSQL
```

Business rules, company scope, permissions, approval separation, transaction
boundaries, lifecycle projection, idempotency, and audit writes stay on the
server. Browser code may coordinate forms and refresh affected projections but
must not reproduce server eligibility logic.

No new service, Next.js route handler, direct database connection, or duplicate
identity model is introduced.

## API Additions

Add bounded read contracts for pending Hire work because mutation identifiers
are not a usable approval queue.

1. `GET /api/v1/hr/hire_requests`
   - Required query: `company_id`.
   - Optional bounded search and limit following existing HR conventions.
   - Requires `hr.employment_lifecycle.approve` and active company access.
   - Returns only pending requests in the authenticated tenant and company.
   - Includes the minimal review projection: request, employee, relationship,
     job, profile-draft assignment, effective date, requester, reason, and
     created timestamp.

2. `GET /api/v1/hr/employees/{employeeId}/hire_requests/{requestId}`
   - Requires `hr.employment_lifecycle.approve` and active company access.
   - Returns one pending or already-decided request for review/result refresh.
   - Excludes private employee data and internal database-only identifiers not
     needed by the workflow.

Existing mutation paths remain compatible:

- `POST /api/v1/hr/employees/{employeeId}/hire_requests`
- `POST /api/v1/hr/employees/{employeeId}/hire_requests/{requestId}/decision`

The generated client and `HrApiClient` adapter are updated with the new reads
and the existing Hire mutations. Contracts and OpenAPI remain authoritative.

## Maker Workflow

Within Employee Assignments:

1. Load server-authorized companies and approved employee drafts.
2. Load the selected employee's assignment timeline and company-scoped master
   records.
3. If no profile-draft assignment exists, allow an authorized user to create
   one using the existing narrow API and validated HR master selections.
4. Load active company jobs.
5. Collect job, effective date, and a required business reason.
6. Submit the existing idempotent Hire request mutation.
7. Show the pending request reference and refresh only the selected employee's
   assignment state.

The interface must state that submission does not activate the employee. It
must disable duplicate submission while a request is in flight and surface
server problem details without substituting mock success.

## Checker Workflow

Within Employee Approvals:

1. Keep the existing employee-draft approval queue unchanged.
2. Add a clearly separated Hire Approvals section visible only with
   `hr.employment_lifecycle.approve`.
3. Load pending requests for the selected authorized company.
4. Load review detail on demand and display the proposed job, assignment
   context, effective date, requester, and reason.
5. Require an approval/rejection reason and explicit confirmation.
6. Submit one idempotent decision request and refresh the queue and detail.

The UI must not hide a server-side self-approval rejection or permission error.
It must show loading, empty, unavailable, success, validation, and
permission-denied states using existing shared primitives.

## Transaction and Data Rules

Approval remains one serializable transaction that must:

1. lock and revalidate the pending request and company scope;
2. reject requester self-approval;
3. record the approved decision;
4. append the authoritative Hire lifecycle event;
5. project the employment relationship to active;
6. create a new relationship-bound operational assignment using the protected
   profile/job context;
7. project the employee status to active;
8. append immutable platform audit evidence; and
9. persist the idempotent response.

The original profile-draft assignment is not converted into an active row.

Rejection records the decision, keeps the relationship non-active, creates no
lifecycle event or operational assignment, does not activate the employee, and
still writes audit and idempotency evidence.

Any failure rolls back the complete decision. Duplicate retries return the
stored response, while reuse of an idempotency key with a different payload is
rejected.

## Security and Integrity

- Authenticate every route through the existing cookie session.
- Enforce permissions and active company access in the API and repository.
- Scope every query by tenant and company.
- Enforce maker/checker separation on the server.
- Require CSRF, allowed origin, and bounded validated input for mutations.
- Return standard problem details without exposing SQL, secrets, private
  employee data, or infrastructure information.
- Reuse Identity & Access actor, role, company-access, and audit authorities.

## Test Strategy

### Contract and unit tests

- OpenAPI contains the bounded Hire queue and detail reads.
- Generated client and `HrApiClient` serialize queries and mutations correctly.
- Router tests cover authentication, validation, CSRF/origin, idempotency
  headers, and repository delegation.
- Component tests cover permission states, form validation, disabled/in-flight
  behavior, queue/detail loading, approval, rejection, and API errors.

### PostgreSQL integration tests

- Maker can create one eligible pending request.
- Duplicate pending requests are rejected.
- Request replay is idempotent and conflicting reuse fails.
- Unauthorized, cross-tenant, and cross-company reads/mutations fail closed.
- Requester cannot decide their own request.
- Approval creates exactly one event, active relationship, new active
  relationship-bound assignment, employee activation, audit record, and
  idempotency record.
- Approval does not mutate the profile-draft assignment.
- Rejection creates no event or operational assignment and does not activate
  the employee.
- A forced mid-transaction failure leaves every affected projection unchanged.

### Verification gates

- HR contract and unit tests pass.
- Targeted PostgreSQL integration tests pass against the isolated database.
- Type checking and API contract generation checks pass.
- Production web build passes.
- Authenticated browser acceptance proves maker submission and independent
  checker approval/rejection through persisted records.

## Completion and Handoff

At completion, update `docs/architecture/hr-backend-delivery-plan.md` with:

- the exact completed Hire capabilities;
- verification commands and observed results;
- any remaining manual acceptance or operational risk; and
- the next safe resume point, expected to be effective-dated employee movement
  workflows only after governed Hire is fully accepted.
