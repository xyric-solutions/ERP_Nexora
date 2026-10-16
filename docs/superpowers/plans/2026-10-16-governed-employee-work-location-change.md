# Governed Employee Work Location Change Implementation Plan

**Design:** `docs/superpowers/specs/2026-10-16-governed-employee-work-location-change-design.md`

## Objective

Ship work-location change through the existing HR API, PostgreSQL, typed
client, Employee Assignments maker surface and Employee Approvals checker
surface. Approval may change only `work_location_id`, must require effective
reviewed jurisdiction evidence for the target, and must not alter organization,
role, manager, compensation or any other assignment dimension.

## Slice 1 - Contract and persistence authority

1. Add strict work-location-change request, decision, queue, detail and result
   schemas to the HR contract package.
2. Add the four versioned OpenAPI paths and generated-client methods.
3. Add one additive HR migration for immutable work-location-change requests,
   source/target snapshots, effective reviewed-jurisdiction validation,
   meaningful-change enforcement, pending uniqueness, decision evidence,
   tenant RLS, indexes and mutation guards.
4. Extend migration integrity expectations to the new HR version.

Verification:

- contract generation/check passes;
- OpenAPI contract tests cover all paths and schemas;
- migration tests apply the new version to isolated PostgreSQL.

## Slice 2 - Repository, service, and routes

1. Add bounded company-scoped work-location-change queue and detail reads.
2. Add idempotent request creation with assignment-change permission, active
   employee/relationship/source checks, same-day effective date, target master
   validation, effective reviewed-jurisdiction evidence, meaningful change,
   duplicate prevention and immutable audit evidence.
3. Add an independent decision method using assignment-change permission and
   requester/checker separation.
4. On approval, lock and revalidate the source, target and jurisdiction
   evidence; close the source; insert one active `work_location_change`
   assignment; and preserve every normalized organization placement in the
   same serializable transaction.
5. On rejection, persist only decision, audit and idempotency evidence.
6. Wire a focused service and four Express routes using existing session,
   validation, CSRF/origin, idempotency and problem-response conventions.

Verification:

- router tests cover parsing, validation and service delegation;
- PostgreSQL integration proves replay/conflict, scope, maker/checker
  separation, same-location and jurisdiction rejection, approval projection,
  rejection non-projection, organization preservation, immutable history and
  unchanged salary rows.

## Slice 3 - Existing HR frontend integration

1. Read the installed Next.js 16 guidance relevant to the existing client
   component and data-fetching pattern before editing UI code.
2. Extend `HrApiClient` with generated work-location-change reads and
   mutations.
3. Add a focused Work Location Change maker panel to Employee Assignments
   using existing company, employee, assignment and master reads.
4. Add a focused Work Location Change checker panel to Employee Approvals with
   current/proposed comparison, jurisdiction-readiness display, confirmation,
   required reason and decision behavior.
5. Preserve Hire, Transfer, Promotion, Manager Change, draft approvals,
   navigation, responsiveness, accessibility and no-mock-error semantics.

Verification:

- focused client/router unit tests pass;
- focused ESLint and formatting checks for changed/new files pass;
- production web build passes.

## Slice 4 - Runtime acceptance and handoff

1. Apply migrations only to the isolated local test database unless the user
   explicitly authorizes another database target.
2. Run typecheck, OpenAPI contract, focused unit/integration, migration, API
   check, production web build and diff-hygiene checks.
3. Run focused browser acceptance against the existing local web/API using
   credentials supplied at runtime and never committed.
4. Verify both panels use live API data. Record a real two-user decision as a
   manual acceptance gate if a second credential is unavailable.
5. Update `docs/architecture/hr-backend-delivery-plan.md` with completed work,
   observed results, working URLs, backend-connected features, limitations,
   current HR progress and the next safe resume point.

## Completion Conditions

- Submission changes no assignment, organization placement or salary.
- The target is a different active company work location with an `approved` or
  `active` jurisdiction profile effective on the change date.
- The requester cannot decide the request.
- Approval atomically preserves history and changes only `work_location_id`.
- All normalized organization placement rows are carried to the new segment.
- Rejection changes no assignment projection.
- Salary-assignment rows are identical before and after both decision paths.
- Every read/write is authenticated, tenant/company scoped, permission
  checked, audited where applicable and backed by PostgreSQL.
- Existing Hire, Transfer, Promotion and Manager Change workflows remain
  passing.
- No unrelated user files or pre-existing untracked content are modified.
