# Governed Employee Organization Placement Change Design

## Purpose

Deliver a production-backed organization-placement workflow for an active
employee. An authorized maker proposes one complete organization hierarchy,
an independent checker approves or rejects it, and approval creates a new
immutable assignment segment without rewriting history.

This workflow is separate from Transfer, Promotion, Manager Change and Work
Location Change. It changes only normalized organization placement. It must
not change the legal company, job, designation, grade, cost centre, work
location, employment type, employee category, reporting manager, relationship
or compensation.

## Existing Authority

The repository already provides:

- relationship-bound, effective-dated assignments and immutable history;
- normalized `employee_assignment_org_unit` placement rows for
  `business_unit`, `division`, `branch`, `department` and `warehouse`;
- company-tree validation and tenant row-level security;
- active company access, assignment permissions, CSRF/origin protection,
  idempotency and immutable platform audit evidence;
- separate maker/checker movement workflows and typed browser clients; and
- the Employee Assignments and Employee Approvals production workspaces.

The existing Transfer decision currently creates branch and department rows
through assignment compatibility projections but does not preserve normalized
business-unit, division or warehouse rows. This slice includes a focused
Transfer compatibility correction so a Transfer cannot silently discard those
placements.

## Chosen Approach

Create a dedicated organization-placement request and decision workflow. Each
pending request stores the source assignment plus complete current and proposed
placement snapshots. Approval closes the source assignment on the day before
the effective date and creates one same-day active assignment segment with the
existing `change_reason = 'organization_change'` value in one serializable
transaction.

The proposed snapshot can contain at most one unit of each supported type:

- business unit;
- division;
- branch;
- department; and
- warehouse.

At least one placement must remain and at least one value must change. Optional
levels are represented explicitly as null. Every non-null unit must be active,
have the declared type, belong to the legal company's tree, and participate in
one coherent hierarchy. All selected units must lie on one ancestry chain in
the company tree: for every selected pair, one unit must be an ancestor of the
other. A unit from a separate branch of the company tree is invalid even when
both units independently belong to the same company.

A one-unit-at-a-time workflow was rejected because changing a parent could
leave stale or incompatible children. Extending Transfer was rejected because
Transfer already has branch/department relocation semantics and a distinct
maker permission. Direct mutation was rejected because placement history is
immutable and sensitive employee movements require independent approval.

## Contracts and API

Add versioned contracts and OpenAPI paths under `/api/v1/hr`:

1. `GET /organization_placement_change_requests`
   - returns a bounded pending queue scoped by `company_id`;
   - requires assignment-change permission and active company access;
   - exposes only minimal employee, assignment, current/proposed placement,
     request, hierarchy-readiness and maker evidence.
2. `POST /employees/{employeeId}/organization_placement_change_requests`
   - accepts company, source assignment, a complete proposed placement object,
     today's effective date and a required business reason;
   - creates no assignment and changes no employee projection.
3. `GET /employees/{employeeId}/organization_placement_change_requests/{requestId}`
   - returns one company-scoped review projection without private employee
     data.
4. `POST /employees/{employeeId}/organization_placement_change_requests/{requestId}/decision`
   - accepts `approved` or `rejected` plus a required decision reason;
   - enforces actor-level maker/checker separation.

Extend the organization-unit directory contract to support all five placement
types. Existing callers that request branch or department remain compatible.
The generated API client and `HrApiClient` remain the only browser-facing data
boundary.

## Persistence

Add one forward-only HR source migration after version 31. The immutable
request table stores:

- tenant, request, employee, legal company, relationship and source-assignment
  identifiers;
- current and proposed identifiers for each of the five placement types;
- effective date and required maker reason;
- pending, approved or rejected state;
- maker/checker identifiers, timestamps and decision reason;
- projected assignment identifier; and
- a positive row version.

Foreign keys protect employee, relationship, source assignment, company,
organization units, actors and projected assignment. A partial unique index
allows only one pending organization-placement request per source assignment.
Company queue and employee history indexes support bounded reads. Forced RLS
uses the established tenant setting.

An insert trigger validates the authoritative active source, snapshot accuracy,
same-company typed units, at least one retained placement, a material change and
hierarchy coherence. An evidence trigger permits only the pending-to-decision
fields to change and prevents deletion or mutation after decision.

## Decision Transaction

Approval executes in one serializable transaction and must:

1. authenticate, authorize and require active company access;
2. lock the pending request and authoritative source assignment;
3. reject self-approval, stale source context and any non-current effective
   date;
4. lock and revalidate all proposed organization units and their hierarchy;
5. close the source assignment at `effective_on - 1 day`;
6. create one relationship-bound active assignment with all non-organization
   fields copied from the locked source;
7. insert the complete proposed normalized placement snapshot;
8. update the request with checker evidence and projected assignment;
9. append immutable platform audit evidence; and
10. persist the idempotent response.

Rejection records decision, audit and idempotency evidence but does not require
the proposed hierarchy to remain valid and never closes or creates an
assignment. Any failure rolls back the entire decision.

This first slice is same-day only. Future-dated approval remains blocked until
a durable activation worker can switch assignment authority without a gap.

## Transfer Compatibility Correction

Transfer retains ownership of branch and department relocation. On approval it
must copy every normalized placement row from the locked source assignment to
the projected assignment, replacing branch and department with the approved
values and omitting a type only when the approved Transfer explicitly makes
that compatibility value null.

The correction changes no Transfer contract, permission, request state or UI.
An integration regression must prove business-unit, division and warehouse
placements survive an approved Transfer while the approved branch and
department take effect.

## Frontend Workflow

Employee Assignments gains a separate Organization Placement Change panel. It
loads the active assignment and company-scoped organization directory, shows
current versus proposed placement, and presents selectors for the five levels.
Child choices are filtered using parent relationships. The form requires a
changed coherent snapshot, today's date and a business reason. It states that
submission does not apply the change and that job, manager, work location and
salary remain unchanged.

Employee Approvals gains a separate checker panel. It shows employee and source
assignment context, the current and proposed hierarchy, hierarchy readiness,
maker evidence and reason. Approval and rejection require a decision reason and
confirmation. Approval is disabled when readiness is false; rejection remains
available.

Both panels include loading, empty, validation, permission-denied, error,
success and in-flight states. API failure never becomes prototype or mock
success. Existing approved layout, shared primitives and navigation remain
unchanged.

## Security and Data Integrity

- Authenticate every route through the existing cookie session.
- Enforce tenant, active company access and `hr.employee_assignment.change` on
  the server for maker and checker actions.
- Enforce actor-level maker/checker separation even when both actors share a
  role.
- Require validated contracts, CSRF, allowed origin, idempotency and standard
  problem responses for mutations.
- Use advisory and row locks to serialize competing movements.
- Exclude private employee data, secrets and infrastructure details from
  projections and errors.
- Preserve assignment, relationship, organization, salary and audit database
  constraints as final integrity authorities.

## Error Handling

The API returns stable problem codes for invalid idempotency keys, permission or
company denial, unavailable source assignments, duplicate pending requests,
unchanged snapshots, missing placement, mistyped or inactive units, cross-
company units, incoherent hierarchy, self-approval, stale requests and invalid
effective dates. Database constraint errors are translated without exposing SQL
or internal infrastructure details.

The UI retains the user's safe input after recoverable errors, prevents double
submission, uses one retry key for the same payload and creates a new key only
after the payload changes or a request succeeds.

## Verification

Contract, router and client tests cover validation, route delegation, query
serialization, CSRF/idempotency headers and standard errors. PostgreSQL
integration tests prove:

- request creation, replay and idempotency conflict;
- duplicate-pending rejection;
- tenant/company scope and permission enforcement;
- invalid type, inactive unit, cross-company unit and broken-hierarchy denial;
- unchanged or empty proposed-snapshot denial;
- self-approval denial;
- approval-time source and hierarchy revalidation;
- atomic source closing and projected assignment creation;
- exact normalized placement projection;
- preservation of legal company, relationship, job, designation, grade, cost
  centre, work location, employment type, category, manager and salary;
- rejection without assignment projection; and
- approved Transfer preservation of business unit, division and warehouse.

The slice also requires migration verification, type checking, OpenAPI/client
drift verification, focused lint, the production web build, local API/web health
and independent two-user browser acceptance when credentials are available.

## Completion Boundary

The slice is complete when contracts, migration, repository, service, routes,
generated client, maker/checker panels, Transfer compatibility regression,
automated verification and the HR delivery-plan handoff are present. Manual
two-user acceptance remains clearly recorded if it cannot be executed.

Future-dated movement activation, cross-company transfer, pay-changing
promotion, lifecycle changes, attendance, leave and payroll are outside this
slice.
