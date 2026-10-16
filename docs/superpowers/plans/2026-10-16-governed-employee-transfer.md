# Governed Employee Transfer Implementation Plan

**Design:** `docs/superpowers/specs/2026-10-16-governed-employee-transfer-design.md`

## Objective

Ship Transfer as the first effective-dated employee movement through the
existing HR API, PostgreSQL, typed client, Employee Assignments maker surface,
and Employee Approvals checker surface.

## Slice 1 — Contract and persistence authority

1. Add strict request, decision, queue, detail, and result schemas to the HR
   contract package.
2. Add the four Transfer OpenAPI paths and generated-client methods.
3. Add one additive HR migration for immutable transfer requests, company and
   source-assignment constraints, pending uniqueness, decision evidence,
   tenant RLS, indexes, and mutation guards.
4. Extend migration integrity expectations to the new HR version.

Verification:

- contract generation/check passes;
- OpenAPI contract tests cover all paths and schemas;
- migration test applies the new version to the isolated PostgreSQL database.

## Slice 2 — Repository, service, and routes

1. Add bounded company-scoped queue and detail repository reads.
2. Add idempotent request creation with transfer permission, active employee
   and relationship scope, active source assignment, proposed context
   validation, changed placement, same-day effective-date checks, duplicate
   pending prevention, and platform audit evidence.
3. Add an independent decision method using the assignment-change permission.
4. On approval, close the source assignment and insert one new protected active
   assignment inside the existing serializable transaction boundary.
5. On rejection, persist only decision, audit, and idempotency evidence.
6. Wire focused service methods and the four Express routes with session,
   validation, origin/CSRF, and idempotency conventions.

Verification:

- router tests cover validation and repository delegation;
- PostgreSQL integration covers idempotency, tenant/company scope,
  maker/checker separation, duplicate/stale requests, approval projection,
  rejection non-projection, and rollback-sensitive invariants.

## Slice 3 — Existing HR frontend integration

1. Read the installed Next.js 16 guidance relevant to the existing client
   component/data-fetching pattern before editing UI code.
2. Extend `HrApiClient` with generated Transfer reads and mutations.
3. Add a focused Transfer maker panel to Employee Assignments using existing
   company, employee, organization-unit, master, and assignment reads.
4. Add a focused Transfer checker panel to Employee Approvals with queue,
   review, confirmation, required reason, and approve/reject behavior.
5. Preserve current Hire and draft-approval behavior, navigation, responsive
   layout, accessibility, and no-mock-error semantics.

Verification:

- focused client/unit tests pass;
- focused ESLint for changed/new UI passes;
- production web build passes.

## Slice 4 — Runtime acceptance and handoff

1. Apply migrations only to the isolated local test database.
2. Run typecheck, contract, focused unit/integration, API check, web build, and
   diff hygiene checks.
3. Run focused Playwright acceptance against the existing local web/API using
   credentials supplied at runtime, never committed.
4. Verify maker and checker surfaces load live API data. Record the independent
   two-user decision as manual if no second credential exists.
5. Update `docs/architecture/hr-backend-delivery-plan.md` with completed work,
   exact observed checks, current limitations, working URLs, backend-connected
   features, and the next safe resume point.

## Completion Conditions

- A Transfer submission cannot change an assignment before approval.
- The requester cannot decide the request.
- Approval preserves history by ending the source and inserting one new
  effective assignment atomically.
- Rejection changes no assignment projection.
- Every read/write is authenticated, tenant/company scoped, permission checked,
  and backed by PostgreSQL.
- Existing Hire and employee approval workflows remain passing.
- No unrelated user files or pre-existing untracked content are modified.
