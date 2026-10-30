# Debug Session: Post-Merge Runtime

## Status

- State: resolved and verified locally
- Started: 2026-10-26
- Branch: `shoaib_nexora`
- Goal: start the latest merged ERP safely while preserving both HR and banking behavior and data.

## Symptoms

- Expected: the Next.js web app, independent API service, worker, and PostgreSQL migrations start cleanly with both HR and banking modules intact.
- Actual: unknown; no concrete runtime error was supplied.
- Trigger: HR work was recently merged into the current branch.
- Reproduction: inspect migration history and status without applying migrations, then run repository-provided validation and service startup checks.

## Safety Constraints

- Do not delete, reset, or discard files or data.
- Do not print or modify `.env` values.
- Do not apply database migrations until migration order, contents, and current database status are understood.
- Preserve tenant scoping and HR/banking behavior.

## Evidence Log

- `git status --short --branch` showed `shoaib_nexora...origin/shoaib_nexora` with no reported working-tree changes before this debug file was created.
- Repository structure contains the root Next.js app plus `server`, `packages`, `node_modules`, `compose.yaml`, and migration/config files.
- The normal sandbox setup returned `helper_unknown_error: setup refresh had errors` for general read commands; read-only repository inspection continued through approved elevated execution. This is tooling/environment evidence, not yet an application root cause.
- HEAD `47a070a` merges banking parent `4bb3a96` and HR parent `d48c3e6`.
- No repository `.env` file exists and no database/runtime variables were present in the invoking process. No environment values were read or printed.
- The already-running isolated Compose test infrastructure exposed PostgreSQL, Redis, and MinIO only on local test ports and reported healthy.
- Before applying anything, the migration ledger was inspected read-only. Module order is `platform`, `security`, `workflow`, `master_data`, `finance`, `hr`, `runtime`; finance was at 30 and HR at 34. Source contained finance 30 and HR 130. The runner uses an advisory lock, validates predecessor/identity, and applies each file in a transaction with rollback on error.
- HR migration 75 references banking and HR migration 76 deliberately disables that link until the banking handoff. Since finance precedes HR, the pending HR sequence was additive and ordered.

## Root Causes

1. Manual merge resolution had concatenated both branch implementations in four files. This produced nested/duplicate declarations, duplicated SQL fragments, and malformed JSX in the client generator, finance posting repository, and ERP shell/content composition.
2. Two integration tests encoded the pre-merge HR ledger and lifecycle catalogue. The implementation and additive migrations intentionally define the newer values, so the assertions were stale rather than evidence of database corruption.
3. The long-lived shared test database contained accumulated test fixtures. Broad integration failures reproduced against that database but not against new isolated databases, so destructive cleanup was neither necessary nor appropriate.

## Repairs

- `packages/contracts/src/generate-client-c4.ts`: removed the nested duplicate client wrapper and preserved authentication/session-expiry plus blob-response behavior.
- `server/api/src/modules/finance/posting/source-repository.ts`: removed duplicate/spliced implementations while preserving active-currency filtering, bank company-currency resolution, and HR's optional row lock.
- `app/shell/prototype-shell.tsx` and `app/shell/prototype-content.tsx`: repaired duplicated merge fragments while preserving mock-page controls and connected finance, banking, and HR workspaces.
- Removed two unused imports left by the shell merge, associated the touched shell's custom form controls with their labels, and changed the already-ARIA-labelled search wrapper from `label` to `div`; no state, submission, or routing behavior changed.
- Regenerated `app/lib/api/generated.ts` and `openapi-v1.json` using the repository generator. The OpenAPI output did not differ from HEAD.
- Removed only type imports that targeted ESLint proved unused from the generated-client template; typecheck caught and preserved the two types still required by method signatures.
- Updated stale migration-ledger and HR lifecycle integration expectations to the merged schema.

## Migration Results

- Applied the repository migration command only to isolated local development/test databases after the order and ledger checks above.
- Existing isolated test database advanced only HR from 34 to 130; other versions remained `platform:11`, `security:19`, `workflow:1`, `master_data:2`, `finance:30`, `runtime:1`.
- Several new empty databases were created without dropping or altering existing databases. Each migrated cleanly to the same final versions, including HR 130 and finance 30.
- No tables, databases, files, fixtures, or user data were deleted or reset.

## Verification

- `npm run typecheck`: passed.
- Focused ESLint across every touched TS/TSX source and test file: passed.
- `npm run api:generate`: passed; generated client is current.
- `npm run api:check`: passed.
- `npm run build:web`: passed with Next.js 16.3.8, including TypeScript and 6/6 static pages.
- `npm run test:unit`: passed, 139 files and 1,036 tests.
- `npm run db:migrate:test`: passed; only the pending HR migrations changed the existing isolated ledger.
- Clean-database `tests/integration/postgres-migrations.test.ts`: passed 14/14.
- Clean-database `tests/integration/governed-user-administration.test.ts`: passed 9/9.
- Clean-database HR suite passed 17/18 before the last stale lifecycle assertion was corrected; the corrected lifecycle case then passed 1/1 in isolation.
- The broad integration suite was stopped after a bounded run because the long-lived shared database produced unrelated fixture-collision failures. Fresh-database reruns established that shared-state contamination, not the migrations, caused the representative failures.
- API readiness at `http://127.0.0.1:4000/api/v1/health/ready`: `ok`, including database, Redis, object storage, HR foundation, master-data foundation, and banking foundation.
- Worker healthcheck exited 0; banking revaluation-reversal and statement-orphan cleanup jobs completed.
- Web root at `http://127.0.0.1:3000`: HTTP 200 and rendered Nexora.
- API PID 72116, worker PID 72460, and web PID 18836 were intentionally left running.
- Full `npm run lint` completed with exit 1 and reported 380 findings (376 errors, 4 warnings) across the merged repository. The output spans longstanding/merged accessibility labels, React effect-state rules, and unused HR symbols in files outside this focused runtime repair. After that run, all 66 findings in the files touched here were resolved and the focused ESLint command passed; the full repository lint was not represented as passing.

## Framework Compliance

- Consulted the installed Next.js 16.3.8 guides `01-app/01-getting-started/02-project-structure.md`, `01-app/01-getting-started/05-server-and-client-components.md`, and `01-app/02-guides/production-checklist.md`.
- The shell repairs remain inside the existing client-component boundaries and do not add or change routes, special files, or project structure.

## Remaining Notes

- `node scripts/audit-ui-theme.mjs --write` refreshed `docs/architecture/global-theme-audit.md` for the merged source inventory. It reports 0/100 feature views with font exceptions and 12/100 with candidate colour exceptions. These are existing review candidates in merged HR/banking/finance sources, not changes made by this repair.
- Runtime logs are under `tmp/postmerge-*.log` and contain local-test service output only.
