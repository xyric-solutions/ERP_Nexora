# Governed Employee Transfer Design

## Purpose

Deliver the first effective-dated employee movement as a production-backed
vertical slice. An authorized maker proposes a transfer for an active employee,
an independent checker approves or rejects it, and approval projects a new
immutable assignment segment without rewriting assignment history.

Promotion, manager-only change, organization-only change, compensation,
payroll, termination, and a generalized movement engine are outside this
slice. The approved HR navigation and existing Employee Assignments and
Employee Approvals workspaces remain the user-facing surfaces.

## Existing Authority

The repository already provides the required foundations:

- relationship-bound active assignments and immutable effective-dated history;
- database guards for company placement, master types, manager eligibility,
  reporting cycles, relationship dates, and overlapping assignment periods;
- tenant sessions, active company access, reviewed transfer/change
  permissions, CSRF/origin validation, idempotency, and platform audit writes;
- bounded employee, company, organization-unit, HR-master, and assignment
  reads; and
- the proven Hire request/decision/projection implementation pattern.

The transfer workflow must reuse these authorities and must not update the
current assignment's business fields in place.

## Chosen Approach

Create a dedicated transfer request and decision workflow. A pending request
stores the source assignment identity plus a complete protected snapshot of the
proposed assignment context. Approval closes the source assignment on the day
before the transfer effective date and inserts a new active assignment segment
with `change_reason = 'transfer'` in one serializable transaction. Rejection
changes no assignment projection.

A generic movement request was rejected for this slice because promotion,
manager, organization, and compensation changes have different permissions,
validation, and downstream effects. Direct assignment mutation was rejected
because it would bypass maker/checker separation and immutable history.

## Contracts and API

Add versioned contracts and OpenAPI paths under `/api/v1/hr`:

1. `GET /transfer_requests`
   - bounded pending queue scoped by `company_id`;
   - requires the existing assignment-change checker permission and active
     company access;
   - returns only the minimal employee, source assignment, proposed placement,
     job/master labels, effective date, requester, reason, and decision state.
2. `POST /employees/{employeeId}/transfer_requests`
   - requires the existing transfer permission;
   - accepts source assignment, company, proposed branch/department, job and
     HR-master identifiers, optional reporting manager, effective date, and a
     required reason;
   - creates only a pending request and audit/idempotency evidence.
3. `GET /employees/{employeeId}/transfer_requests/{requestId}`
   - returns one company-scoped review projection without private employee data.
4. `POST /employees/{employeeId}/transfer_requests/{requestId}/decision`
   - requires the existing assignment-change checker permission;
   - accepts `approved` or `rejected` plus a required reason;
   - enforces requester/checker separation.

The generated browser client and `HrApiClient` remain the only frontend data
boundary.

## Persistence and Transaction Rules

An additive HR migration creates an immutable transfer-request table with:

- tenant, company, employee, relationship, and source-assignment keys;
- the complete proposed assignment context needed to make the decision stable;
- pending/approved/rejected state and maker/checker evidence;
- unique protection against more than one pending transfer for the same source
  assignment; and
- indexes for the company-scoped pending queue and employee history.

Database foreign keys and triggers validate tenant scope, company placement,
master types, source assignment authority, and decision immutability. The
request is not an assignment and cannot affect current employee projections.

Approval runs in one serializable transaction and must:

1. lock and revalidate the pending request and active source assignment;
2. reject self-approval and stale or conflicting source context;
3. require the effective date to equal the decision date, fall after the source
   assignment start, and remain within the active employment relationship;
4. mark the request approved with decision evidence;
5. close the source assignment at `effective_on - 1 day` as `ended`;
6. insert the new relationship-bound assignment using the protected request
   context and `change_reason = 'transfer'`;
7. write immutable platform audit evidence; and
8. persist the idempotent response.

Rejection records decision/audit evidence but never closes or creates an
assignment. Any failure rolls back the entire decision.

This first slice deliberately applies same-day transfers only. Approving a
future-dated transfer would mark the current segment ended before the future
segment became effective under the existing immutable assignment rules. Future
scheduling requires a durable activation worker and is deferred rather than
creating a temporary authority gap.

## Frontend Workflow

Employee Assignments gains a separate Transfer panel for active employees. It
loads the current assignment and server-authorized placement/master options,
pre-fills unchanged context, requires a changed placement plus effective date
and reason, and clearly states that submission does not apply the transfer.

Employee Approvals gains a separate Transfer Approvals section. It loads the
pending queue, shows source versus proposed context, warns about maker/checker
separation, requires a decision reason and confirmation, and refreshes the
queue and assignment timeline after a decision.

Both surfaces provide loading, empty, validation, permission-denied, error,
success, and in-flight states. API failure must never be replaced by mock
success.

## Security and Integrity

- Authenticate every route using the existing cookie session.
- Enforce tenant, active company access, and permissions on the server.
- Use the reviewed `hr.employee_assignment.transfer` permission for makers and
  `hr.employee_assignment.change` for independent decisions.
- Require CSRF, allowed origin, bounded validation, idempotency, and standard
  problem responses for mutations.
- Exclude private employee data, secrets, and infrastructure details from
  projections and errors.
- Preserve the existing assignment and organization database guards as final
  integrity authorities.

## Verification

Contract/router/client tests cover validation, authorization delegation,
query serialization, idempotency headers, and standard errors. PostgreSQL
integration tests prove creation/replay/conflict, duplicate-pending rejection,
tenant/company scope, self-approval denial, stale-source rejection, atomic
approval projection, rejection non-projection, immutable evidence, and source
history preservation.

The slice also requires type checking, API contract verification, a production
web build, focused lint for new UI, migration verification, and authenticated
browser acceptance of both live Transfer surfaces. A real two-user browser
decision remains explicitly manual if only one local credential is available.

## Completion Boundary

The phase is complete when the Transfer request, queue, independent decision,
assignment projection, audit evidence, tests, live UI integration, and delivery
plan handoff are present. The next safe movement slice is Promotion; it must
receive its own design because job/grade and payroll dependencies differ from
Transfer.
