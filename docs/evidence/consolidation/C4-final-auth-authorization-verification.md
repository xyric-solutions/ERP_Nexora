# C4 final-root authentication and authorization verification

Date: 2026-10-10

## Scope and result

C4 is implemented in the final web application root (`prototype_ERP`) with Node.js/Express, Next.js, PostgreSQL, and Redis. The implementation uses email/password authentication, opaque server-side sessions, normalized PostgreSQL authorization, governed role/assignment administration, maker-checker, SoD, last-administrator protection, idempotency, and chained audit evidence.

Automated, API-level, worker, storage, and clean-deployment verification passed. The approved in-app Browser runtime cannot run in a Codex IDE extension session, so the visual Manual Gate remains blocked and C4 is not marked accepted.

## Production routes

- Web: `/login`, `/admin/identity?tab=roles|assignments|approvals|permissions|audit`
- Authentication: `/api/v1/auth/login`, `/session`, `/session/rotate`, `/logout`, `/logout-all`
- Authorization: `/api/v1/security/permissions`, `/capabilities`, `/roles`, `/role_actions`, `/assignments`, `/assignment_requests`, `/assignment_request_actions`, `/approvals`, `/approval_actions`, `/audit_events`

## PostgreSQL and Redis evidence

- Verification database: disposable clone `nexora_c4_test`; the source database was not mutated.
- PostgreSQL clone: 140 public tables and 37 source-ledger migration records after additive security migration 0006 and runtime migration 0001.
- Redis: real server at `127.0.0.1:56379` used by authentication throttling and session integration tests.
- C4 integration suite: 2 files, 5 tests passed.
- Governed lifecycle proved role creation, idempotent replay/conflict, submission, independent approval, activation, assignment request/approval, exact denials, tenant denial, immutable audit emission, and last-administrator rollback.
- Live API verification against the disposable clone proved maker login (`200`), role creation (`201`), identical idempotent replay (`201`), and the same PostgreSQL resource on both responses.

The integration suite intentionally leaves uniquely named evidence in the disposable clone because assignment-version and security-audit tables enforce append-only behavior. No source/Demo authorization data was deleted or rewritten.

## Verification results

- `npm test`: passed.
  - production Next.js build passed;
  - format check passed;
  - lint passed;
  - unit: 58 passed;
  - contract: 6 passed;
  - security: 5 passed;
  - legacy regression: 163 passed.
- PostgreSQL/Redis C4 integration: 5 passed.
- OpenAPI drift check: passed.
- Production dependency audit: 0 vulnerabilities.
- Performance: 2 passed.
- Production source-migration integration: 5 passed.
- Durable PostgreSQL/Redis worker integration: 1 passed.
- Automated Playwright regression: 8 passed, including all 67 desktop HR baselines, seven mobile baselines, keyboard journeys, and the email/password login accessibility check. This automated result is not Manual Gate evidence.
- API readiness: HTTP 200 with service, database, Redis, and object storage `ok`.
- Synthetic API session checks: maker and checker login/list/logout passed; restricted user received HTTP 403; session restore passed; logout revocation returned HTTP 401; invalid-CSRF mutation returned HTTP 403.
- All five `/admin/identity` deep links returned HTTP 200.
- The security router now mounts after the JSON parser and request instrumentation. This fixed the observed live defect where an authenticated mutation passed session/CSRF enforcement but reached validation with an undefined request body. The regression test proves both fail-closed rejection and a valid `201` mutation.
- The active `/auth/mfa` page was removed. The clean production build now contains only `/`, `/login`, and `/admin/identity` application routes, and `/auth/mfa` returns HTTP 404.
- The automated login accessibility check found a 3.69:1 footer contrast defect. The footer now uses the established accessible secondary-text color and the rerun passed with no WCAG A/AA violations.

## Platform deployment verification

- The complete canonical production migration chain is present under `packages/db/source-migrations`: platform 1–6, security 1–6, workflow 1, finance 1, HR 1–22, and runtime 1.
- A fresh isolated Compose deployment created 140 public tables and applied all 37 ledger entries. Repeated migration runs reported `changedModules: []`.
- Every tenant-owned table in the fresh database has row-level security enabled and forced.
- `nexora_migrator` and `nexora_app` are non-superuser, non-createdb, non-createrole, non-bypassrls roles. The application role has schema usage but no schema-create privilege and has the required runtime-table DML grants.
- PostgreSQL, Redis, MinIO, migration, API, worker, and web all started from the consolidated production image build. Migration and MinIO initialization exited successfully; API, PostgreSQL, Redis, MinIO, and worker reported healthy.
- The isolated verification bindings were web `127.0.0.1:3101`, API `127.0.0.1:4100`, PostgreSQL `127.0.0.1:55436`, Redis `127.0.0.1:56381`, and MinIO API/console `127.0.0.1:59010/59011`; they did not replace or mutate the existing Demo containers.
- The private MinIO bucket exists and reports `private` anonymous access. The production API readiness endpoint reported object storage `ok`.
- Credentialed CORS preflight from the verification web origin returned HTTP 204 with the exact allowed origin and credentials enabled.
- A synthetic job enqueued through BullMQ was processed by the production worker and durably recorded in PostgreSQL as `completed` with one attempt.
- The production deployment graph does not provide the unauthenticated sample-job endpoint; a direct request returned HTTP 404 and a unit regression covers its absence.
- Production dependency audit (`npm audit --omit=dev`) reports zero vulnerabilities. The full development-tool audit reports 19 vulnerabilities (4 moderate, 15 high) in build/prototype tooling. Fix suggestions require breaking dependency changes and are intentionally deferred from C4 under the no-unrelated-upgrades constraint.

## Remaining acceptance limitation

The clean production platform is independently deployable. C4 acceptance remains blocked only by the required visual/manual Browser gate described below; automated browser evidence is not being substituted for that gate.

## Manual Gate blocker

The required Browser skill was read and its official browser-client bootstrap was invoked. It failed with `Cannot redefine property: process`. No `agent.browsers` runtime or backend was created. Vendor files were not patched and no standalone Playwright or alternate controller was used.

The official OpenAI Browser documentation confirms that Browser is not available in Codex CLI or the Codex IDE extension and directs users to the ChatGPT desktop app: <https://learn.chatgpt.com/docs/browser?surface=app>. Resolution therefore requires a new ChatGPT desktop app session rooted at this project, with the built-in Browser and local-site permission for `http://127.0.0.1:3000`. In that supported host, invoke `@Browser`, verify an actual backend is available, and rerun the five-tab visual/manual workflow before accepting C4 or beginning C5/R08.

## Git safety

- Final Git root: `E:/XS/Xyric Solutions LLP/prototype_ERP`.
- The new final root currently reports 39 top-level untracked entries; no commit was created.
- The read-only source repository remained at `91db05fb68d624f289d9bff8c22eaddf94b44abc`; its pre-existing dirty working tree was not reset, cleaned, moved, or committed.
