# Debug Session: Organisation & Masters Entry Creation Failure

## Status

Resolved on the live local API database on 2026-11-04. The original verification
below targeted the test database, not the database used by the running API.

## 2026-11-04 recurrence and corrected repair

- The user's Department save at 10:28 Pakistan time returned HTTP 500 with
  PostgreSQL `42P01`, position 13. That position identifies the shared
  `insert into hr_record_code_counter` statement. It was not a permission denial
  or duplicate-code conflict.
- API process 65420 uses PostgreSQL on port 55433. Connection activity and schema
  inspection identified the live database as `nexora_postmerge_service` at HR
  migration 130, without `hr_record_code_counter`. The separate
  `nexora_source_test` database was already at migration 133 and had the table.
- Applied the existing migration runner to the confirmed live database with
  `migrateSourceModule(pool, "hr", { throughVersion: 131 })`. Migration 131 creates
  the durable code counter. Unrelated payroll/Banking migrations 132 and 133
  were deliberately left for their own deployment workflow.
- Verified two consecutive live allocations for department, branch, designation,
  job grade, job, cost centre, work location, employment type and employee
  category. Every type returned its `001` then `002` code. All verification
  allocations were rolled back; no test master or organization record was
  retained in the live database.
- Existing historical codes were not changed. `DEPT-001` remains valid for the
  first successful department save because failed saves never commit a number.
- The running API picked up the schema repair without a restart. Readiness is
  HTTP 200 with all checks `ok`. Its in-memory readiness implementation still
  predates the stricter source check; a future API deployment must coordinate
  its required schema floor and the unrelated remaining migrations.
- Verification: HR automatic-code integration suite 25/25 passed on the separate
  test database; HR readiness unit suite 3/3 passed. No production source or UI
  changes were necessary, so a web rebuild was not required.
- Local evidence helpers: `tmp/inspect-hr-create-runtime.mjs` and
  `tmp/repair-hr-code-schema.ts`. Neither prints secrets.

## Symptoms

- Expected: a valid Organisation & Masters create form saves a new record and assigns a stable generated code such as `DEPT-001`.
- Actual: every create attempt is rejected with the same generic form error; reported examples include organization units and departments.
- Reproduction: open Organisation & Masters, open Organisation Structure, choose Add organization unit, enter a valid name and save. The same failure occurs on other master create forms.
- Timeline: not supplied.

## Evidence

- `HrOrganizationStructureSheetWorkspace` and `HrConfiguredMasterSheetWorkspace` deliberately submit `code: "AUTO"` on create. The visible code is only a preview; the server owns final allocation so codes remain stable and concurrency-safe.
- `SourceHrRepository` delegates `AUTO` allocation to `allocateHrCode` inside the authorized mutation transaction.
- `allocateHrCode` reads and upserts `public.hr_record_code_counter`; that relation is introduced by HR migration `0131_automatic_record_codes.forward.sql`.
- The API running on `localhost:4000` was connected to PostgreSQL database `nexora_source_test` on port `55433`.
- Before repair, that database's highest applied HR migration was `130` and `public.hr_record_code_counter` did not exist. Therefore every Organisation & Masters create path that submitted `AUTO` failed at the same shared allocation step.
- The existing `hr_foundation` readiness check only required three older HR relations. It reported the API ready even though the schema required by the current create path was absent.

## Root Cause

Runtime schema drift: the API code included transactional automatic HR record-code allocation, but its database had not applied HR migration 131 (or the later current migrations). The shared counter table was missing, so all master and organization-unit creates using `AUTO` failed before insertion.

## Resolution

- Applied the repository's existing `npm run db:migrate:test` workflow to the local API database. HR migrations are now at version `133`, and `public.hr_record_code_counter` exists.
- Kept the UI, API contracts, and automatic-code allocation behavior unchanged.
- Extracted an HR foundation readiness check that requires the existing core HR relations, `public.hr_record_code_counter`, and HR migration version `>=133`.
- Wired `server.ts` to use the focused readiness check, so a similarly stale database is reported unavailable before traffic is considered ready.
- Added focused unit coverage for the missing-schema failure, successful readiness, and production wiring.

## Verification

- `tests/integration/hr-record-codes.test.ts`: 25/25 passed against the migrated local test database, including branch and department creation through the authorized repository with `code: "AUTO"`.
- `tests/unit/hr-readiness.test.ts`: 3/3 passed.
- `tests/integration/hr-shift-allocations.test.ts`: 10/10 passed through the organization-unit repository path.
- `npm.cmd exec eslint server/api/src/server.ts server/api/src/modules/hr/readiness.ts tests/unit/hr-readiness.test.ts`: passed.
- `npm.cmd run typecheck`: passed.
- `GET http://127.0.0.1:4000/api/v1/health/ready`: returned `status: "ok"` with `hr_foundation: "ok"` after the migration.
