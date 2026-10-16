# Governed Employee Hire Completion — Implementation Plan

## Objective

Complete the existing governed Hire workflow as a production-backed vertical
slice while preserving the approved Employee Assignments and Employee
Approvals workspaces. The slice is complete only when maker submission and an
independent checker decision are verified through the API and PostgreSQL.

Design source:
`docs/superpowers/specs/2026-10-16-governed-employee-hire-completion-design.md`.

## Guardrails

- Keep `server/api` as the only browser-facing backend boundary.
- Keep contracts and generated client behavior in `packages/contracts`.
- Keep PostgreSQL access in the HR repository and migrations in `packages/db`.
- Do not add another HR navigation item or replace the approved workspaces.
- Do not present fixtures as live Hire data or fall back to mock success.
- Preserve tenant/company scope, maker-checker separation, permissions,
  idempotency, serializable transactions, and immutable audit evidence.
- Add no migration unless query or integrity evidence demonstrates one is
  required.

## Delivery Steps

### 1. Establish the executable baseline

- Inspect repository status and isolate pre-existing user changes.
- Read the relevant Next.js 16 local documentation before changing frontend
  components.
- Run the narrow existing HR contract/router tests and record their baseline.
- Inspect migration 26 and the Hire repository transaction to confirm current
  indexes, constraints, rollback behavior, and projection semantics.

Completion condition: current behavior and failures are documented before any
production code changes.

### 2. Add authoritative Hire review read contracts

Files expected to change:

- `packages/contracts/src/hr/index.ts`
- `packages/contracts/src/openapi-c4.ts`
- `packages/contracts/src/generate-client-c4.ts`
- generated client artifact owned by the repository generator
- contract/OpenAPI tests

Work:

- Define bounded query, queue-item, detail, and response schemas.
- Add `GET /api/v1/hr/hire_requests` and
  `GET /api/v1/hr/employees/{employeeId}/hire_requests/{requestId}`.
- Keep mutation contracts backward compatible.
- Regenerate the browser client using the existing script.

Completion condition: contract tests prove the paths, validation, and generated
methods; generation checks report no drift.

### 3. Implement company-scoped queue and detail reads

Files expected to change:

- `server/api/src/modules/hr/source-repository.ts`
- `server/api/src/modules/hr/router.ts`
- HR router/repository tests

Work:

- Query pending requests by authenticated tenant and authorized company with a
  bounded limit and optional search.
- Return only the minimum review projection.
- Read one request by tenant, company, employee, and request identifier,
  including decided requests for result refresh.
- Require `hr.employment_lifecycle.approve` and active company access.
- Use standard problem responses and avoid private employee fields.

Completion condition: unit tests cover authentication, validation, permission,
company scope, not-found behavior, and repository delegation.

### 4. Prove Hire mutations against PostgreSQL

Files expected to change:

- focused HR integration tests following the existing test layout
- production code only if a demonstrated defect is found

Work:

- Create isolated maker/checker fixtures with active policy, approved employee,
  profile-draft assignment, and approved active job.
- Verify creation, duplicate-pending protection, idempotent replay, conflicting
  key rejection, unauthorized/cross-company access, and self-approval denial.
- Verify approval writes exactly one decision/event/relationship-bound active
  assignment/employee activation/audit/idempotency result and leaves the
  profile-draft assignment unchanged.
- Verify rejection creates no activation projection or Hire event.
- Verify transaction rollback if the existing test seams permit deterministic
  fault injection; otherwise record this as an explicit remaining verification.

Completion condition: targeted integration tests run against the isolated
PostgreSQL database and observed results are recorded.

### 5. Complete the HR frontend adapter

Files expected to change:

- `app/features/hr/api/hr-client.ts`
- adapter tests

Work:

- Wrap Hire queue/detail reads and existing request/decision mutations.
- Preserve generated contract types and standard problem mapping.
- Do not duplicate server eligibility or permission logic in the client.

Completion condition: adapter tests prove query serialization, idempotency
headers, and mutation payloads.

### 6. Extend Employee Assignments as the maker surface

Files expected to change:

- existing Employee Assignments workspace and focused child components/tests

Work:

- Preserve the current timeline and approved visual structure.
- Load authorized companies, approved employees, profile-draft state, master
  records, and active jobs through the HR client.
- Permit profile-draft assignment creation through the existing API when
  absent.
- Add job, effective date, and required business reason fields for Hire
  submission.
- Show that submission remains pending and does not activate the employee.
- Implement loading, empty, validation, permission, unavailable, success, and
  in-flight states without mock fallback.

Completion condition: component tests prove successful submission, validation,
duplicate-click protection, permission behavior, and server errors.

### 7. Extend Employee Approvals as the checker surface

Files expected to change:

- existing Employee Approvals workspace and focused child components/tests

Work:

- Keep the employee-draft approval queue unchanged.
- Add a visually separate Hire Approvals section for authorized checkers.
- Load pending company requests and review detail on demand.
- Require a reason and explicit approval/rejection confirmation.
- Refresh the queue after a decision and surface server-side self-approval or
  authorization rejection.
- Implement loading, empty, validation, permission, unavailable, success, and
  in-flight states.

Completion condition: component tests prove queue/detail rendering and both
decision paths without regressing draft approvals.

### 8. Verify the complete slice and hand off

Run repository-provided commands for:

- targeted contract, router, adapter, component, and integration tests;
- generated API drift check;
- type checking and linting applicable to changed files;
- `git diff --check`;
- `npm.cmd run build:web`;
- authenticated browser acceptance against the isolated local stack.

Confirm persisted records through read-only API/database evidence after browser
submission and an independent decision. Do not claim browser-to-PostgreSQL
acceptance if it was not observed.

Finally update `docs/architecture/hr-backend-delivery-plan.md` with completed
capabilities, exact verification results, remaining risks, and the next safe
resume point.

## Stop Conditions

Pause and report rather than broaden scope if implementation requires:

- changing the approved HR navigation or prototype information architecture;
- weakening tenant/company/permission or maker-checker controls;
- destructive schema/data operations;
- a new framework or dependency;
- changes to unrelated modules; or
- unresolved ambiguity that can alter employment or accounting semantics.
