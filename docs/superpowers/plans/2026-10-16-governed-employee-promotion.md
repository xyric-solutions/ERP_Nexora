# Governed Employee Promotion Implementation Plan

**Design:** `docs/superpowers/specs/2026-10-16-governed-employee-promotion-design.md`

## Objective

Ship assignment-only Promotion through the existing HR API, PostgreSQL, typed
client, Employee Assignments maker surface, and Employee Approvals checker
surface. Promotion may change job, designation, and job grade only; it must not
change salary or any other assignment dimension.

## Slice 1 - Contract and persistence authority

1. Add strict Promotion request, decision, queue, detail, and result schemas to
   the HR contract package.
2. Add the four Promotion OpenAPI paths and generated-client methods.
3. Add one additive HR migration for immutable Promotion requests, company and
   source-assignment constraints, active job/designation/grade validation,
   meaningful-change enforcement, pending uniqueness, decision evidence,
   tenant RLS, indexes, and mutation guards.
4. Extend migration integrity expectations to the new HR version.

Verification:

- contract generation/check passes;
- OpenAPI contract tests cover all paths and schemas;
- migration tests apply the new version to isolated PostgreSQL.

## Slice 2 - Repository, service, and routes

1. Add bounded company-scoped Promotion queue and detail reads.
2. Add idempotent request creation with assignment-change permission, active
   employee/relationship/source-assignment checks, active proposed masters,
   meaningful role change, same-day effective date, duplicate prevention, and
   immutable audit evidence.
3. Add an independent decision method using assignment-change permission and
   requester/checker separation.
4. On approval, copy all non-role dimensions from the locked source, close the
   source assignment, and insert one new active `promotion` assignment in the
   same serializable transaction.
5. On rejection, persist only decision, audit, and idempotency evidence.
6. Wire a focused Promotion service and four Express routes with existing
   authentication, validation, CSRF/origin, idempotency, and error conventions.

Verification:

- router tests cover parsing, validation, and service delegation;
- PostgreSQL integration proves replay/conflict, scope, maker/checker
  separation, meaningful changes, approval projection, rejection
  non-projection, immutable history, and unchanged salary rows.

## Slice 3 - Existing HR frontend integration

1. Extend `HrApiClient` with generated Promotion reads and mutations.
2. Add a focused Promotion maker panel to Employee Assignments using existing
   company, employee, job, master, and assignment reads.
3. Add a focused Promotion checker panel to Employee Approvals with queue,
   current/proposed comparison, confirmation, required reason, and decision
   behavior.
4. Clearly state that Promotion changes assignment role fields only and never
   changes compensation.
5. Preserve Hire, Transfer, draft approvals, navigation, responsive behavior,
   accessibility, and no-mock-error semantics.

Verification:

- focused client/router unit tests pass;
- focused ESLint for changed/new Promotion files passes;
- production web build passes.

## Slice 4 - Runtime acceptance and handoff

1. Apply migrations only to the isolated local test database.
2. Run typecheck, OpenAPI contract, focused unit/integration, migration, API
   check, production web build, and diff-hygiene checks.
3. Run focused Playwright acceptance against the existing local web/API using
   credentials supplied at runtime and never committed.
4. Verify the maker/checker surfaces use live API data. Record the independent
   two-user decision as manual if a second credential is unavailable.
5. Update `docs/architecture/hr-backend-delivery-plan.md` with completed work,
   observed results, working URLs, backend-connected features, limitations,
   and the next safe resume point.

## Completion Conditions

- A Promotion submission changes no assignment or salary before approval.
- At least one of job, designation, or grade changes.
- The requester cannot decide the request.
- Approval atomically preserves history and changes only the three allowed
  assignment role fields.
- Rejection changes no assignment projection.
- Salary-assignment rows are identical before and after either decision.
- Every read/write is authenticated, tenant/company scoped, permission
  checked, audited where applicable, and backed by PostgreSQL.
- Existing Hire and Transfer workflows remain passing.
- No unrelated user files or pre-existing untracked content are modified.
