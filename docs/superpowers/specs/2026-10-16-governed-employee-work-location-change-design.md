# Governed Employee Work Location Change Design

## Purpose

Deliver a dedicated, production-backed workflow for changing an active
employee's work location. An authorized maker proposes a same-day change, an
independent checker approves or rejects it, and approval creates a new
immutable effective-dated assignment segment without rewriting history.

Branch and department changes remain owned by the existing Transfer workflow.
Job, designation and grade changes remain owned by Promotion. Reporting-line
changes remain owned by Manager Change. Compensation, future scheduling,
work-location master authoring and a generalized movement engine are outside
this slice.

## Existing Authority

The repository already provides the foundations this workflow must reuse:

- relationship-bound assignments with immutable effective-dated history;
- active, company-scoped `work_location` master records;
- approved and active effective-dated work-location jurisdiction profiles;
- tenant sessions, active company access, CSRF/origin validation,
  idempotency, permissions and immutable platform audit evidence;
- the typed HR client and versioned `/api/v1/hr` contract boundary; and
- proven Hire, Transfer, Promotion and Manager Change request/decision
  patterns.

Work location is payroll and statutory context. A successful HTTP request or
an active master record alone is insufficient authority to assign a location;
the target must also have reviewed jurisdiction evidence effective on the
change date.

## Chosen Approach

Create a dedicated Work Location Change request and decision workflow. The
pending request records the authoritative source assignment and the proposed
work location. Approval closes the source assignment on the day before the
change and appends a new active assignment with
`change_reason = 'work_location_change'` in one serializable transaction.
Rejection changes no assignment projection.

Extending Transfer was rejected because it would change an already verified
contract and obscure the payroll-jurisdiction control. A generic movement
engine was rejected because the completed movement types have distinct
permissions, validation rules and downstream effects.

## Contracts and API

Add four versioned endpoints under `/api/v1/hr`:

1. `GET /work_location_change_requests`
   - returns a bounded, company-scoped checker queue;
   - requires `hr.employee_assignment.change`; and
   - exposes only minimal employee, source/proposed location, effective-date,
     requester, reason, jurisdiction-readiness and decision evidence.
2. `POST /employees/{employeeId}/work_location_change_requests`
   - requires `hr.employee_assignment.change`;
   - accepts company, source assignment, proposed work location, effective
     date and reason; and
   - creates only pending request and audit/idempotency evidence.
3. `GET /employees/{employeeId}/work_location_change_requests/{requestId}`
   - returns one tenant- and company-scoped review projection without private
     employee data.
4. `POST /employees/{employeeId}/work_location_change_requests/{requestId}/decision`
   - requires `hr.employee_assignment.change`;
   - accepts `approved` or `rejected` and a required reason; and
   - enforces independent maker/checker actors.

The generated browser client and `HrApiClient` remain the only frontend data
boundary. Existing movement contracts remain unchanged.

## Persistence and Transaction Rules

An additive HR migration creates an immutable work-location-change request
table containing:

- tenant, company, employee, relationship and source-assignment keys;
- current and proposed work-location identifiers;
- effective date and required reason;
- pending/approved/rejected state with maker/checker evidence;
- the projected assignment identifier after approval;
- unique protection against more than one pending request for a source
  assignment; and
- company queue and employee-history indexes.

Database foreign keys, row-level security and triggers validate tenant scope,
company/master compatibility, source authority, evidence immutability and
decision shape. The target work location must be active and belong to the
employee's legal employer. It must differ from the source location.

The target must also have an `approved` or `active` work-location jurisdiction
profile whose effective period contains the change date. A draft, superseded,
missing or ineffective profile blocks request creation and approval. Approval
revalidates this evidence so a previously valid request cannot apply after its
jurisdiction authority changes.

Approval runs in one serializable transaction and must:

1. lock and revalidate the pending request and active source assignment;
2. reject self-approval and stale or conflicting source context;
3. require the effective date to equal the decision date, fall after the
   source assignment start and remain within the employment relationship;
4. revalidate the proposed work location and effective jurisdiction profile;
5. mark the request approved with decision evidence;
6. close the source assignment at `effective_on - 1 day` as `ended`;
7. insert a new relationship-bound active assignment that changes only
   `work_location_id` and uses `change_reason = 'work_location_change'`;
8. preserve normalized organization placement and all unrelated assignment
   context;
9. write immutable platform audit evidence; and
10. persist the idempotent response.

Rejection records decision and audit evidence but never closes or creates an
assignment. Any failure rolls back the entire decision.

This slice supports same-day changes only. Future-dated approval requires the
durable activation worker already identified by the delivery plan and remains
deferred.

## Frontend Workflow

Employee Assignments gains a separate Work Location Change panel for active
employees. It loads the current authoritative assignment and active work
locations for the selected company, shows current versus proposed location,
and requires a changed target, same-day effective date and reason. It states
that submission creates a request rather than applying the change.

Employee Approvals gains a separate Work Location Change section. It loads the
pending queue, displays source and proposed location, effective date,
requester, reason and jurisdiction readiness, warns about maker/checker
separation, and requires a decision reason plus confirmation.

Both surfaces provide loading, empty, validation, permission-denied, error,
success and in-flight states. API failure never becomes mock success. The
approved HR navigation and existing Assignments and Approvals layouts remain
the user-facing surfaces.

## Security and Integrity

- Authenticate every route using the existing cookie session.
- Enforce tenant, active company access and
  `hr.employee_assignment.change` on the server.
- Enforce actor-level maker/checker separation even when both actors share the
  same permission.
- Require CSRF, allowed origin, bounded validation, idempotency and standard
  problem responses for mutations.
- Exclude private employee data, secrets and internal infrastructure details
  from review projections and errors.
- Preserve existing assignment, organization, relationship and jurisdiction
  database guards as final integrity authorities.
- Do not write payroll or compensation tables. The effective assignment is
  the location input consumed by later payroll/statutory processing.

## Verification

Contract, generated-client, router and service tests cover validation,
authorization delegation, query serialization, idempotency headers and
standard errors.

PostgreSQL integration tests prove:

- request creation, replay and conflicting idempotency rejection;
- duplicate-pending, same-location, cross-company, inactive-master and missing
  or ineffective jurisdiction-profile rejection;
- tenant/company scope and self-approval denial;
- stale-source and jurisdiction-evidence revalidation at decision time;
- atomic approval projection and rejection without projection;
- immutable request and assignment evidence;
- organization-placement preservation;
- preservation of company, relationship, branch, department, job,
  designation, grade, cost centre, employment type, employee category and
  reporting manager; and
- unchanged effective salary-assignment evidence after both decision paths.

The slice also requires type checking, API contract verification, source
migration verification, focused formatting/lint, regression coverage for Hire,
Transfer, Promotion and Manager Change, a production web build, and
authenticated browser acceptance of both live panels when local credentials
and the configured database permit it. Manual two-user acceptance remains
explicit if only one local actor is available.

## Completion Boundary

The phase is complete when the request, queue, independent decision,
assignment projection, jurisdiction guard, audit evidence, generated client,
live UI integration, automated verification and delivery-plan handoff are
present. It does not complete future-dated activation, pay-changing Promotion,
work-location profile authoring, or broader lifecycle work.
