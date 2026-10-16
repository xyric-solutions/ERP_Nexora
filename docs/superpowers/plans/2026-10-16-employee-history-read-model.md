# Employee History Read Model Implementation Plan

**Design:** `docs/superpowers/specs/2026-10-16-employee-history-read-model-design.md`

## Objective

Ship truthful, production-backed employee lifecycle-event and non-sensitive
profile-version history through the existing HR API and Employee Status History
workspace. Repair profile-version continuity for current data, make existing
draft profile mutations maintain immutable versions atomically, and preserve
the current status-history behavior and route.

This slice is read-only from the Employee History workspace. It must not add
active-employee editing, lifecycle mutations, private profile access or a
general cross-workflow audit explorer.

## Slice 1 - Characterization, contracts and migration authority

### Files

- `packages/contracts/src/hr/index.ts`
- `packages/contracts/src/openapi-c4.ts`
- `packages/contracts/src/generate-client-c4.ts`
- `packages/db/source-migrations/hr/0033_employee_history_read_model.forward.sql`
- `tests/contract/openapi.test.ts`
- `tests/integration/postgres-migrations.test.ts`
- `tests/integration/hr-employee-history.test.ts` (new)

### Work

1. Add strict shared history pagination input with `limit` default 25, maximum
   100, and an optional bounded opaque cursor.
2. Add separate lifecycle-event and profile-version item/directory schemas.
   Keep response schemas strict so private profile fields and actor identifiers
   cannot drift into the public API.
3. Represent lifecycle previous state as nullable and resulting state as
   required. Include code, label and canonical class without exposing policy
   internals not required by the screen.
4. Represent profile capture origin as `migration_baseline` or
   `recorded_change`; expose only names, preferred name, work email, version
   dates, revision, evidence reference and recorded time.
5. Add both GET paths to versioned OpenAPI and client generation sources.
6. Add migration 0033 without editing prior migrations. For every employee:
   - append a baseline when no version exists;
   - compare the current employee projection with the latest open version;
   - close and supersede only a mismatching open version;
   - leave matching chains unchanged;
   - preserve all historical values and mark new rows with a migration source;
   - retain forced tenant RLS and immutable-history triggers.
7. Add or adjust only those indexes justified by the final keyset query shape.
8. Extend migration integrity expectations from HR version 32 to 33.

### Verification

- Contract tests prove both paths and strict public response schemas.
- Migration tests prove version 33 applies in isolated PostgreSQL.
- Integration characterization proves missing, stale and matching profile
  chains are repaired without rewriting prior evidence or inventing
  intermediate revisions.
- RLS, close-once behavior and delete/update immutability remain enforced.

## Slice 2 - Atomic profile-version capture in existing draft workflows

### Files

- `server/api/src/modules/hr/source-repository.ts`
- `tests/integration/hr-foundation-api.test.ts`
- `tests/integration/hr-employee-history.test.ts`

### Work

1. Add a focused repository helper that locks the current open profile version,
   compares the complete stored profile snapshot, and appends the next revision
   only when profile fields materially change.
2. In `createEmployeeDraft`, append revision 1 after the platform audit is
   created and before idempotency/commit. Use the audit event as the evidence
   reference.
3. In `updateEmployeeDraft`, keep the existing employee lock, create immutable
   audit evidence, close the prior open version once, and append the successor
   in the same transaction.
4. Treat an update that changes only fields outside the profile-version schema,
   or supplies values identical to the current profile snapshot, as no new
   profile revision.
5. Preserve idempotency behavior: a replay returns the stored response without
   closing or appending versions.
6. Allow any profile-version or audit failure to roll back the employee
   projection, version chain and idempotency evidence together.
7. Do not broaden the draft-edit contract or introduce an active-employee edit
   path.

### Verification

- Draft creation produces exactly one initial version.
- Material draft edits close and supersede the current version.
- Same-day edits have increasing deterministic revisions.
- Unchanged/replayed requests produce no duplicate versions.
- A forced profile-version failure proves transaction rollback.
- Existing create/update/submit/approval behavior remains green.

## Slice 3 - Scoped repository reads, service and routes

### Files

- `server/api/src/modules/hr/source-repository.ts`
- `server/api/src/modules/hr/employees/service.ts`
- `server/api/src/modules/hr/router.ts`
- `tests/unit/hr-api-router.test.ts`
- `tests/integration/hr-employee-history.test.ts`

### Work

1. Add cursor encode/decode behavior using a small versioned payload containing
   only the stable keyset values needed by each query. Reject malformed,
   oversized or wrong-version cursors with a stable HR validation problem.
2. Add `listEmployeeLifecycleEvents` and `listEmployeeProfileHistory` repository
   methods with `limit + 1` keyset reads and nullable continuation cursors.
3. Require `hr.employment_history.read`, tenant context and employee company
   visibility through the established assignment/company-access boundary.
4. Tenant-scope every join to relationships, lifecycle states and profile
   versions. Return the existing non-enumerating employee-not-found behavior for
   missing and out-of-scope subjects.
5. Select only public response columns. In particular, the profile query must
   not select date of birth, personal email, personal phone or recorded actor.
6. Derive capture origin from controlled source-reference prefixes while
   retaining the evidence reference required by the approved contract.
7. Add thin service delegation and two GET routes. Parse query values through
   contracts and retain the router's no-store response policy.
8. Do not change the existing status-history route or persistence source.

### Verification

- Router tests cover authentication context, parameter parsing, delegation,
  default/max limits and malformed input.
- PostgreSQL integration covers permission denial, tenant isolation, company
  isolation, not-found equivalence, stable order, first/next/last cursor pages,
  state joins and profile capture-origin mapping.
- Integration assertions prove prohibited private and actor fields are absent
  from serialized responses.

## Slice 4 - Generated client and Employee History workspace

### Files

- `openapi-v1.json` (generated)
- `app/lib/api/generated.ts` (generated)
- `app/features/hr/api/hr-client.ts`
- `app/features/hr/views/hr-employee-status-history-workspace.tsx`
- `app/shell/prototype-content.tsx`
- `app/shell/config/prototype-data.ts` only if the visible navigation label is
  owned there
- `tests/unit/hr-client.test.ts`

### Work

1. Before editing UI code, read the installed Next.js 16 guidance relevant to
   client components, effects and data fetching under
   `node_modules/next/dist/docs/`.
2. Run repository-owned API generation after contract/OpenAPI changes and add
   narrow `HrApiClient` lifecycle/profile history methods.
3. Preserve `/#/hr/employee-status-history`, but relabel its visible workspace
   as Employee History.
4. Reuse existing company and employee selectors and permission messaging.
5. Add shadcn/Tailwind tabs for Status Changes, Lifecycle Events and Profile
   Versions. Do not introduce a feature stylesheet.
6. Keep independent initial/loading/ready/empty/error/load-older state for the
   two new sources. One failed request must not hide other valid evidence.
7. Append cursor pages without duplicates, prevent concurrent duplicate loads,
   retain rows after a pagination failure, and clear all rows/cursors when the
   selected company or employee changes.
8. Show migration rows as `Baseline capture` with honest explanatory text and
   application versions as `Recorded change`.
9. Expose no mutation controls and no mock fallback. Correct the corrupted
   status transition arrow in the touched view.
10. Preserve semantic tables, explicit labels, keyboard/focus behavior and
    narrow-screen horizontal scrolling.

### Verification

- Generated-client drift check passes.
- Client unit tests cover URL encoding, defaults and continuation cursors.
- Focused frontend tests or source-level component assertions cover the three
  evidence sections, independent failures, baseline labels and Load older.
- Focused ESLint and formatting checks pass for touched files.
- The production web build passes on installed Next.js 16.3.8.

## Slice 5 - Full regression, runtime acceptance and handoff

### Files

- `docs/architecture/hr-backend-delivery-plan.md`
- existing HR Playwright acceptance only when its credential/configuration
  prerequisites are available

### Work

1. Run typecheck, API generation/check, contract tests, focused unit tests,
   migration tests and the new employee-history PostgreSQL integration suite.
2. Run the governed Hire/Transfer/Promotion/Manager/Work Location/Organization
   regression suite because those workflows create or depend on employee,
   relationship and assignment evidence used for scope.
3. Run focused ESLint, formatting verification, the production web build and
   `git diff --check`.
4. Inspect existing local API/web processes and health endpoints without
   restarting healthy services or changing shared data unnecessarily.
5. Apply migration 33 only to the isolated test database unless the configured
   development database is explicitly identified and confirmed safe.
6. Run browser acceptance against the live API when credentials and migration
   state permit. Confirm status, lifecycle and profile tabs load real data.
7. Perform a real draft create/update check only with synthetic development
   data and verify the resulting versions through the production API. Record it
   as open if independent manual acceptance cannot be completed.
8. Update the HR delivery plan with exact completed scope, observed command
   results, working URLs, migration state, remaining limitations, progress and
   the next safe implementation slice.

### Exact verification commands

```powershell
npm.cmd run typecheck
npm.cmd run api:generate
npm.cmd run api:check
npm.cmd run test:contract -- tests/contract/openapi.test.ts
npm.cmd run test:unit -- tests/unit/hr-api-router.test.ts tests/unit/hr-client.test.ts
npm.cmd run test:integration -- tests/integration/postgres-migrations.test.ts tests/integration/hr-foundation-api.test.ts tests/integration/hr-employee-history.test.ts
npm.cmd run test:integration -- tests/integration/hr-governed-hire.test.ts tests/integration/hr-governed-transfer.test.ts tests/integration/hr-governed-promotion.test.ts tests/integration/hr-governed-manager-change.test.ts tests/integration/hr-governed-work-location-change.test.ts
npm.cmd exec eslint -- packages/contracts/src/hr/index.ts packages/contracts/src/openapi-c4.ts packages/contracts/src/generate-client-c4.ts server/api/src/modules/hr/router.ts server/api/src/modules/hr/employees/service.ts server/api/src/modules/hr/source-repository.ts app/features/hr/api/hr-client.ts app/features/hr/views/hr-employee-status-history-workspace.tsx tests/unit/hr-api-router.test.ts tests/unit/hr-client.test.ts tests/contract/openapi.test.ts tests/integration/hr-employee-history.test.ts tests/integration/postgres-migrations.test.ts
npm.cmd exec prettier -- --check packages/contracts/src/hr/index.ts packages/contracts/src/openapi-c4.ts packages/contracts/src/generate-client-c4.ts server/api/src/modules/hr/router.ts server/api/src/modules/hr/employees/service.ts server/api/src/modules/hr/source-repository.ts app/features/hr/api/hr-client.ts app/features/hr/views/hr-employee-status-history-workspace.tsx tests/unit/hr-api-router.test.ts tests/unit/hr-client.test.ts tests/contract/openapi.test.ts tests/integration/hr-employee-history.test.ts tests/integration/postgres-migrations.test.ts
npm.cmd run build:web
git diff --check
```

If the isolated PostgreSQL/Redis test services are not running, use the
repository's existing test-infrastructure startup procedure before integration
tests. Do not point these commands at a shared or production database.

## Completion Conditions

- Migration 33 preserves prior evidence and records only honest current
  baselines where continuity is missing or stale.
- Employee draft creation and material profile edits maintain one atomic,
  immutable version chain; replay and unchanged input add no noise.
- Lifecycle and profile endpoints are authenticated, permission-scoped,
  tenant/company isolated, bounded and stably paginated.
- Public schemas and SQL projections exclude date of birth, personal email,
  personal phone and actor identifiers.
- The existing route displays Status Changes, Lifecycle Events and Profile
  Versions with independent loading/error/empty/pagination behavior and no mock
  success.
- Existing HR status, draft, Hire and assignment/movement regressions remain
  green.
- OpenAPI, generated client, API implementation and browser adapter remain in
  sync.
- The HR delivery plan records exact evidence, limitations, URLs and the next
  safe resume point.
- No unrelated user files or pre-existing untracked content are modified.
