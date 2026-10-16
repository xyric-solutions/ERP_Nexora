# Governed Employee Manager Change Implementation Plan

**Design:** `docs/superpowers/specs/2026-10-16-governed-employee-manager-change-design.md`

## Objective

Ship reporting-manager change through the existing HR API, PostgreSQL, typed
client, Employee Assignments maker surface, and Employee Approvals checker
surface. The workflow may change only `reporting_manager_id`, including an
explicitly reviewed clear action; it must not change salary or any other
assignment dimension.

## Slice 1 - Contract and persistence authority

1. Add strict manager-change request, decision, queue, detail, and result
   schemas to the HR contract package. Require exactly one proposal intent:
   another manager or `clear_reporting_manager = true`.
2. Add the four versioned manager-change OpenAPI paths and generated-client
   methods.
3. Add one additive HR migration for immutable manager-change requests,
   nullable proposed-manager intent, company and source-assignment constraints,
   meaningful-change enforcement, pending uniqueness, decision evidence,
   tenant RLS, indexes, and mutation guards.
4. Extend migration integrity expectations to the new HR version.

Verification:

- contract generation/check passes;
- OpenAPI contract tests cover all paths, schemas, and nullable-clear intent;
- migration tests apply the new version to isolated PostgreSQL.

## Slice 2 - Repository, service, and routes

1. Add bounded company-scoped manager-change queue and detail reads.
2. Add idempotent request creation with manager-change maker permission,
   active employee/relationship/source-assignment checks, same-day effective
   date, explicit clear intent, meaningful change, eligible same-company
   manager validation, duplicate prevention, and immutable audit evidence.
3. Add an independent decision method using assignment-change checker
   permission and requester/checker separation.
4. On approval, lock and revalidate the source, copy every non-manager field,
   close the source assignment, and insert one new active `manager_change`
   assignment in the same serializable transaction. Reuse database self-manager
   and recursive reporting-cycle protection.
5. On rejection, persist only decision, audit, and idempotency evidence.
6. Wire a focused manager-change service and four Express routes with existing
   authentication, validation, CSRF/origin, idempotency, and error conventions.

Verification:

- router tests cover parsing, validation, explicit clearing, and service
  delegation;
- PostgreSQL integration proves replay/conflict, scope, maker/checker
  separation, manager change, explicit clear, self/cycle rejection, approval
  projection, rejection non-projection, immutable history, and unchanged
  salary rows.

## Slice 3 - Existing HR frontend integration

1. Read the installed Next.js 16 guidance relevant to the existing client
   component and data-fetching pattern before editing UI code.
2. Extend `HrApiClient` with generated manager-change reads and mutations.
3. Add a focused Manager Change maker panel to Employee Assignments using
   existing company, employee, and assignment reads. Provide a deliberate
   `No reporting manager` choice rather than treating omission as a clear.
4. Add a focused Manager Change checker panel to Employee Approvals with
   current/proposed comparison, explicit-clear labeling, confirmation,
   required reason, and decision behavior.
5. Preserve Hire, Transfer, Promotion, draft approvals, navigation, responsive
   behavior, accessibility, and no-mock-error semantics.

Verification:

- focused client/router unit tests pass;
- focused ESLint for changed/new manager-change files passes;
- production web build passes.

## Slice 4 - Runtime acceptance and handoff

1. Apply migrations only to the isolated local test database.
2. Run typecheck, OpenAPI contract, focused unit/integration, migration, API
   check, production web build, and diff-hygiene checks.
3. Run focused Playwright acceptance against the existing local web/API using
   credentials supplied at runtime and never committed.
4. Verify both panels use live API data. Record a real two-user approval as a
   manual acceptance gate if a second credential is unavailable.
5. Update `docs/architecture/hr-backend-delivery-plan.md` with completed work,
   observed results, working URLs, backend-connected features, limitations,
   current HR progress, and the next safe resume point.

## Completion Conditions

- Submission changes no assignment or salary before approval.
- Exactly one manager proposal intent is supplied: another eligible manager or
  an explicit clear.
- The requester cannot decide the request.
- Approval atomically preserves history and changes only
  `reporting_manager_id`.
- Self-reporting, unavailable/cross-company managers, and recursive reporting
  cycles are rejected.
- Rejection changes no assignment projection.
- Salary-assignment rows are identical before and after approval or rejection.
- Every read/write is authenticated, tenant/company scoped, permission
  checked, audited where applicable, and backed by PostgreSQL.
- Existing Hire, Transfer, and Promotion workflows remain passing.
- No unrelated user files or pre-existing untracked content are modified.
