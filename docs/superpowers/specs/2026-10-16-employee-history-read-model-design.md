# Employee History Read Model Design

## Purpose

Deliver production-backed, read-only visibility into authoritative employee
lifecycle events and immutable profile versions without exposing private
employee data or adding a new mutation path. The existing Employee Status
History workspace becomes the single Employee History surface while the three
evidence types retain distinct API contracts and persistence semantics.

This slice must also repair a confirmed profile-evidence gap: the
`hr_employee_profile_version` table exists, but current employee-draft creation
and update operations do not append versions. A history screen cannot be
presented as authoritative until those existing mutations maintain the version
chain atomically.

## Existing Authority

The repository already provides:

- an append-only `hr_employment_event` table with tenant RLS, relationship
  sequence rules, lifecycle-state validation and mutation-prevention triggers;
- an immutable, effective-dated `hr_employee_profile_version` table with a
  migration-time baseline from HR migration 13;
- a separate immutable `employee_status_history` projection and a working
  typed Status History API and Tailwind workspace;
- authenticated HR sessions, permission checks, company access, tenant RLS,
  generated clients and standard API problem responses; and
- indexed relationship, assignment, lifecycle-event and profile-version data.

The approved prototype inventory contains an Employee History reporting
concept, while the production application currently exposes only Employee
Status History. No separate prototype directory exists in this repository; the
root Next.js application and inventory are the applicable UI references.

## Confirmed Gap

HR migration 13 captured the employee projection that existed when the
migration ran. The current `createEmployeeDraft` and `updateEmployeeDraft`
transactions write `employee` and immutable platform audit evidence, but they
do not write `hr_employee_profile_version`.

Consequently:

- employees created after migration 13 may have no profile version;
- a version captured by migration 13 may no longer match the current employee
  projection; and
- intermediate profile edits that were not versioned cannot be reconstructed
  safely from current data.

This design repairs future continuity and records an honest current baseline.
It must never fabricate missing intermediate history.

## Chosen Approach

Evolve `/#/hr/employee-status-history` into an Employee History workspace with
three sections:

1. Status Changes, backed by the existing status-history endpoint;
2. Lifecycle Events, backed by authoritative `hr_employment_event` rows; and
3. Profile Versions, backed by `hr_employee_profile_version` rows.

The sections share the existing company and employee selectors but load and
fail independently. The existing route remains valid so bookmarks and
navigation do not break.

Separate standalone pages were rejected because they would duplicate company
and employee selection, loading logic and navigation. A combined backend
timeline endpoint was rejected because it would blur distinct schemas,
permissions, ordering rules, retention semantics and future private-data
controls.

## Contracts and API

Add versioned contracts and OpenAPI paths under `/api/v1/hr`:

1. `GET /employees/{employeeId}/lifecycle_events`
   - accepts an optional opaque cursor and `limit`, defaulting to 25 and capped
     at 100;
   - returns deterministic newest-first lifecycle evidence plus a nullable next
     cursor;
   - exposes event identifier, relationship identifier, sequence, event type,
     effective date, previous/resulting state code, label and canonical class,
     reason, source reference, recorded timestamp and approval timestamp;
   - never exposes recorder or approver actor identifiers.
2. `GET /employees/{employeeId}/profile_history`
   - accepts the same bounded cursor contract;
   - returns deterministic newest-first immutable versions plus a nullable next
     cursor;
   - exposes version identifier, revision, effective range, first/middle/last
     and preferred names, work email, evidence reference, capture origin and
     recorded timestamp;
   - never exposes date of birth, personal email, personal phone or actor
     identifiers.

The two response types remain distinct. Cursor values are opaque to clients,
validated by the server and used for stable keyset pagination rather than
offset pagination. Malformed cursors return a standard validation problem and
must not expose query or decoder details.

`HrApiClient` and the generated API client remain the only browser-facing data
boundary. Browser code must not construct infrastructure queries or access
PostgreSQL directly.

## Persistence and Migration 33

Add one forward-only HR source migration after version 32. It must preserve all
existing rows and must not edit migration 13.

For each employee, migration 33 compares the current employee profile
projection with the latest open profile version:

- when no profile version exists, append one current baseline version;
- when an open version exists but its safe and private profile fields no longer
  match the employee projection, close that version once and append a successor
  containing the current projection;
- when the open version already matches, do nothing; and
- mark inserted evidence with a migration-specific source reference from which
  the API derives `capture_origin = 'migration_baseline'`.

The migration does not guess when an unrecorded change occurred and does not
create invented intermediate revisions. Existing immutable rows remain
unchanged except for the one permitted close operation on the current open
version.

The existing indexes on
`(tenant_id, relationship_id, effective_on desc, sequence desc)` and
`(tenant_id, employee_id, effective_from desc)` remain the starting point.
Add an index only if the final keyset query plan demonstrates that the existing
index cannot support stable bounded reads.

## Profile Version Capture

The existing employee-draft transactions gain focused persistence behavior:

- draft creation appends revision 1 in the same database transaction as the
  employee and draft-scope rows;
- draft update locks the employee and current open profile version, closes the
  prior version once and appends the next revision in the same transaction;
- a replayed idempotent request returns the stored response without appending a
  duplicate version;
- unchanged profile fields do not produce an additional version; and
- any profile-version failure rolls back the employee projection, platform
  audit and idempotency record together.

The version snapshot retains the complete database evidence, including private
fields already defined by the table, but the read API projects only the
approved non-sensitive subset. This slice does not create an active-employee
profile-edit workflow. Future active-profile changes require a separate
governed design and must use the same version chain.

Same-day edits use monotonically increasing revisions and the existing
supersession chain so their order remains deterministic. Effective-date and
close semantics must continue to satisfy the table's immutability trigger and
constraints.

## Repository and Service Behavior

Both new reads pass through the HR router, employee service and source
repository. Each read must:

1. authenticate through the existing cookie session;
2. require `hr.employment_history.read`;
3. set the tenant database context;
4. prove the employee is visible through an assignment in a company currently
   granted to the user;
5. apply the validated cursor and bounded limit;
6. use deterministic keyset ordering; and
7. map database values into the narrow contract without returning actor or
   private-profile fields.

The current UI continues to require `hr.employee.read` because it uses the
existing employee directory as its selector. This initial slice therefore
supports employees visible through the current production picker. Former-
employee discovery can be expanded with the future resignation/termination
workflow rather than introducing a speculative history-subject directory now.

Lifecycle state joins must remain tenant-scoped. A missing or out-of-scope
employee produces the same non-enumerating not-found behavior used by current
HR employee evidence reads.

## Frontend Workflow

Rename the visible workspace to Employee History while preserving
`/#/hr/employee-status-history`. Company and employee selectors remain above
three tabs:

- **Status Changes** preserves the current status table;
- **Lifecycle Events** shows effective date, event type and sequence,
  previous-to-resulting lifecycle state, canonical result, reason and evidence
  timing; and
- **Profile Versions** shows revision, effective range, non-sensitive identity
  values, work email, evidence reference, capture origin and recorded time.

Each tab owns independent loading, ready, empty, error and pagination state.
Failure in one evidence source must not hide successfully loaded data in
another. A Load older action appends the next keyset page while preserving
already loaded rows and preventing duplicate in-flight requests.

Migration-origin rows display `Baseline capture`; normal application evidence
displays `Recorded change`. Explanatory text states that a baseline is an
observed current snapshot and does not reconstruct earlier unrecorded edits.

The workspace contains no edit, delete, correction, approval or lifecycle
action controls. API failure never becomes mock success. Existing Tailwind and
shared shadcn primitives are reused, tables remain semantically marked up, and
narrow layouts use controlled horizontal scrolling. The corrupted arrow glyph
in the current status table is corrected as part of the touched surface.

## Security and Data Integrity

- Enforce authentication, tenant RLS, `hr.employment_history.read` and active
  company access on the server.
- Do not rely on hidden tabs or client permissions as authorization.
- Exclude date of birth, personal email, personal phone, recorder identifiers
  and approver identifiers from the new response schemas.
- Keep private fields in PostgreSQL only; do not fetch them in the profile
  history read query when they are not needed for the response.
- Preserve immutable lifecycle events and profile versions. The workspace is
  read-only and adds no bypass around governed workflows.
- Validate and bound all query parameters, including cursor size and decoded
  shape.
- Return standard problem details without SQL, stack traces, infrastructure
  addresses or private values.
- Keep draft projection, profile version, audit and idempotency writes in one
  transaction to prevent partial evidence.

## Error Handling

The API returns stable problems for unauthenticated access, missing permission,
out-of-scope employee, malformed cursor and invalid limits. Cursor decoding and
database errors are translated through existing conventions.

The UI distinguishes initial-load failure from Load older failure. A failed
pagination request retains existing rows and permits a safe retry. Changing the
company or employee clears prior evidence and cursors so records cannot appear
under the wrong selection.

## Verification

Migration and PostgreSQL integration tests must prove:

- HR migration version 33 is applied without changing prior migration files;
- employees without a version receive one baseline;
- a stale open version is closed and reconciled without fabricating
  intermediate history;
- matching version chains remain unchanged;
- tenant RLS and immutability remain enforced;
- draft creation writes exactly one initial profile version;
- draft update closes and supersedes the current version atomically;
- same-day edits retain deterministic revision order;
- unchanged updates do not create noise;
- idempotent replay does not duplicate profile versions;
- a forced version-write failure rolls back the projection and evidence; and
- lifecycle/profile reads enforce permission, tenant and company scope,
  deterministic order and cursor boundaries.

Contract, router and client tests must cover schema validation, route
delegation, query serialization, cursor continuation and standard errors. They
must also prove that private profile fields and actor identifiers are absent
from the public schemas.

Frontend tests or focused component verification must cover loading, empty,
partial-error, permission-denied, baseline labels, independent tab data and
Load older behavior while preserving the existing Status Changes view.

The implementation verification gate is:

- TypeScript typecheck;
- OpenAPI generation and drift check;
- focused contract, router, client and PostgreSQL integration tests;
- source migration verification;
- focused ESLint;
- production web build on the installed Next.js version;
- `git diff --check`;
- local web/API health checks when the existing services are available; and
- browser acceptance against the live API.

A real create/update-to-PostgreSQL workflow is reported as manually accepted
only after the resulting version chain is observed through the production API.
No test is reported as passed unless it was executed and observed.

## Completion Boundary

The slice is complete when migration 33, truthful profile-version capture,
contracts, OpenAPI, repository, service, routes, generated client, unified
Employee History workspace, focused automated verification and the HR delivery
plan handoff are present.

The following remain outside this slice:

- private profile-history access and its dedicated permission model;
- active-employee profile editing;
- status or lifecycle mutations;
- former-employee search expansion;
- corrections to historical evidence;
- the full cross-workflow platform audit explorer; and
- probation, confirmation, suspension, resignation, termination and rehire
  workflows.
