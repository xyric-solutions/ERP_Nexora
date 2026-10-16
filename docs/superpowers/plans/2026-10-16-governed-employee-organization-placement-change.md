# Governed Employee Organization Placement Change Implementation Plan

**Design:** `docs/superpowers/specs/2026-10-16-governed-employee-organization-placement-change-design.md`

## Objective

Ship complete organization-placement change through the existing HR API,
PostgreSQL, typed client, Employee Assignments maker surface and Employee
Approvals checker surface. Approval may change only the normalized business
unit, division, branch, department and warehouse hierarchy. It must preserve
the legal company, relationship, role, manager, work location, compensation
and every other assignment dimension.

## Slice 1 - Contract and persistence authority

1. Extend the organization-unit directory contract to support all five
   normalized placement types without breaking branch/department callers.
2. Add strict organization-placement request, decision, queue, detail and
   result schemas to the HR contract package.
3. Add four versioned OpenAPI paths and generated-client methods.
4. Add one additive HR migration for immutable placement-change requests,
   complete current/proposed snapshots, typed unit and coherent-hierarchy
   validation, meaningful-change enforcement, pending uniqueness, decision
   evidence, tenant RLS, indexes and mutation guards.
5. Extend migration integrity expectations to the new HR version.

Verification:

- contract generation and drift checks pass;
- OpenAPI contract tests cover every new path;
- migration tests apply the new version to isolated PostgreSQL.

## Slice 2 - Repository, service, routes and Transfer compatibility

1. Expand the bounded company organization-unit read projection to all five
   placement types while retaining existing permission and company scope.
2. Add bounded company-scoped placement-change queue and detail reads.
3. Add idempotent request creation with assignment-change permission, active
   employee/relationship/source checks, same-day effective date, exact current
   snapshot, complete proposed snapshot, typed unit, company-tree, coherence,
   meaningful-change, duplicate and audit controls.
4. Add independent decisions with assignment-change permission and actor-level
   requester/checker separation.
5. On approval, lock and revalidate the source and proposed hierarchy; close
   the source; insert one active `organization_change` assignment; copy every
   non-organization field; and project the complete normalized hierarchy in
   the same serializable transaction.
6. On rejection, persist only decision, audit and idempotency evidence.
7. Correct Transfer approval so it carries source business-unit, division and
   warehouse placements while replacing only approved branch/department rows.
8. Wire the service and four Express routes through existing session,
   validation, CSRF/origin, idempotency and problem-response conventions.

Verification:

- router tests cover parsing, validation and delegation;
- PostgreSQL integration proves replay/conflict, scope, maker/checker
  separation, invalid hierarchy rejection, approval projection, rejection
  non-projection, immutable evidence, unchanged non-organization context and
  salary;
- Transfer regression proves non-Transfer placements survive approval.

## Slice 3 - Existing HR frontend integration

1. Read the installed Next.js 16 client-component and data-fetching guidance
   before editing the existing UI.
2. Extend `HrApiClient` with generated placement-change reads and mutations.
3. Add a focused Organization Placement Change maker panel to Employee
   Assignments with current/proposed hierarchy comparison, parent-filtered
   selectors, same-day date, reason and no-mock error behavior.
4. Add a focused checker panel to Employee Approvals with hierarchy readiness,
   maker/checker separation, confirmation, required reason and rejection
   availability when approval becomes invalid.
5. Preserve Draft, Hire, Transfer, Promotion, Manager Change, Work Location,
   navigation, responsiveness and accessibility behavior.

Verification:

- focused client/router unit tests pass;
- new panels pass focused ESLint and formatting checks;
- production web build passes.

## Slice 4 - Runtime acceptance and handoff

1. Apply migrations only to the isolated test database unless a configured
   development database is explicitly confirmed.
2. Run typecheck, OpenAPI contract, focused unit/integration, migration, API
   drift, production web build and diff-hygiene checks.
3. Verify the existing local web and API health endpoints without disrupting
   their processes or data.
4. Run browser acceptance only with runtime credentials; never commit or print
   secrets. Record independent two-user acceptance as open if unavailable.
5. Update `docs/architecture/hr-backend-delivery-plan.md` with completed work,
   exact evidence, working URLs, limitations, progress and the next safe slice.

## Completion Conditions

- Submission changes no employee, assignment, placement or salary projection.
- Proposed units are correctly typed, active, company-scoped and lie on one
  coherent ancestry chain.
- At least one placement remains and at least one placement changes.
- The requester cannot decide the request.
- Approval atomically closes the source, creates one active assignment and
  projects exactly the approved five-level snapshot.
- Legal company, relationship, job, designation, grade, cost centre, work
  location, employment type, category, manager and salary remain unchanged.
- Rejection changes no assignment projection and remains possible if approval
  readiness later fails.
- Transfer continues to change only branch/department and preserves other
  normalized placement rows.
- Existing governed HR movement regressions remain green.
- No unrelated user files or pre-existing untracked content are modified.
