# Nexora Governed User Management Implementation Plan

- Status: implementation and non-browser automated gate complete; approved-browser Manual Gate pending
- Date: 2026-10-12
- Canonical repository: `E:\XS\Xyric Solutions LLP\prototype_ERP`
- Approved design: `../specs/2026-10-12-governed-user-management-design.md`
- Production workspace: `/admin/identity?tab=users`
- Scope boundary: governed human-user lifecycle administration only

## 1. Outcome

Implement PostgreSQL-backed user management in the existing Identity & Access
workspace. Dynamic roles with exact permissions can govern account identity,
status, companies, optional employee binding, initial and later role
assignments, credentials, and sessions. The backend remains authoritative for
tenant/company isolation, maker-checker, SoD, delegation, last-administrator,
idempotency, concurrency, and audit controls.

This plan does not authorize hard deletion, MFA, OIDC, SAML, email invitations,
service-account administration, a separate route or identity service, prototype
changes, unrelated HR/Payroll work, dependency upgrades, or a commit.

## 2. Delivery Invariants

1. Preserve every existing account, credential, role, assignment, employee
   binding, session, authorization decision, and audit row.
2. New database changes are additive or constraint-safe. No destructive data
   rewrite is permitted.
3. Existing authorization remains authoritative during company-access
   backfill and shadow parity. Activating company access for legacy accounts is
   a separate acceptance decision.
4. New accounts require allowed companies and one default company before
   activation.
5. A one-time password is returned once after approval and is never persisted,
   logged, audited, cached, or placed in browser storage.
6. Reset-required credentials cannot receive a normal ERP session.
7. Session invalidation is enforced by PostgreSQL `session_version`; Redis
   cleanup is defense in depth and cannot restore an invalidated session.
8. Every mutation requires server-side session validation, trusted origin,
   CSRF, exact permission, tenant boundary, idempotency, and current row state.
9. No static Admin role is introduced. Administration is permission- and
   delegation-driven.
10. No task may discard or overwrite unrelated working-tree content.

## 3. Implementation Sequence

### Task 1 — Characterize existing behavior before modification

**Files**

- Modify: `tests/integration/c4-security-administration.test.ts`
- Modify: `tests/integration/c4-source-auth.test.ts`
- Modify: `tests/unit/tenant-sessions.test.ts`
- Modify: `tests/unit/web-session-client.test.ts`
- Modify: `tests/contract/openapi.test.ts`
- Modify: `tests/e2e/foundation.spec.ts`

**Work**

1. Preserve current role, assignment, approval, audit, tenant-free login,
   organization selection, session rotation, logout, CSRF, origin, and
   fixation-prevention assertions.
2. Add failing public-behavior tests for:
   - Users list/detail contracts;
   - user request create/update/submit/approve/reject;
   - emergency lock and session revocation;
   - `password_change_required` login and first-password change;
   - Users tab and deep-link behavior.
3. Record failures as missing-feature evidence. Do not weaken existing tests.

**Focused verification**

```powershell
npm.cmd run test:unit -- --run tests/unit/tenant-sessions.test.ts tests/unit/web-session-client.test.ts
npm.cmd run test:contract -- --run tests/contract/openapi.test.ts
npm.cmd run test:integration -- --run tests/integration/c4-security-administration.test.ts tests/integration/c4-source-auth.test.ts
```

The new assertions must fail for the expected missing behavior before product
code is added.

### Task 2 — Add the governed user-management PostgreSQL schema

**Files**

- Create: `packages/db/source-migrations/security/0008_governed_user_management.forward.sql`
- Modify: `tests/integration/postgres-migrations.test.ts`
- Create: `tests/security/user-management-database-security.test.ts`
- Modify: `packages/db/src/schema/security.ts` only if this Drizzle schema is
  still used as a production metadata boundary for the affected relations

**Schema work**

1. Add compatible account columns:
   - nullable legacy `display_name` with API-required value for new accounts;
   - `session_version bigint not null default 1`;
   - archive actor/time/reason metadata with completeness checks.
2. Extend credential state:
   - `must_change_password`;
   - `password_version`;
   - `password_changed_at`;
   - constrained `credential_status`;
   - allow legacy PBKDF2 columns to be null only for complete valid Argon2
     credentials;
   - require one complete verifier representation and preserve every existing
     verifier row.
3. Create `security_user_change_request` with tenant-composite foreign keys,
   draft/submitted/approved/rejected state, immutable submitted/decided
   proposals, maker/checker evidence, proposal JSON validation, row version,
   indexes, forced RLS, and no delete path.
4. Create `security_user_company_access` with stable IDs, company validation,
   default flag, grant/revoke evidence, source request, active indexes, partial
   unique active default, forced RLS, and a trigger rejecting delete/history
   mutation.
5. Add exact `security.user_account.*` permission definitions using password
   assurance and reviewed sensitivity.
6. Extend only the database constraints needed to support user approval
   references. Preserve existing role/assignment approval semantics.
7. Record security migration version 8.

**Database assertions**

- clean migration and version order;
- migration over populated version 7 without source-row hash/count change;
- foreign keys, checks, indexes, RLS flags/policies, ACLs, triggers, and query
  plans;
- one active default maximum;
- cross-tenant company/user/request denial;
- submitted/decided request and access-history immutability;
- verifier completeness and existing credential compatibility;
- rollback on any failed statement.

### Task 3 — Build deterministic company-access backfill and shadow projections

**Files**

- Create: `packages/db/src/user-company-access-backfill.ts`
- Create: `packages/db/src/backfill-user-company-access-cli.ts`
- Modify: `packages/db/src/index.ts`
- Modify: `packages/db/package.json`
- Modify: root `package.json`
- Create: `tests/integration/user-company-access-backfill.test.ts`
- Create: `docs/runbooks/governed-user-management-rollout.md`

**Work**

1. Require the migration-owner database connection and acquire a dedicated
   advisory transaction lock.
2. Read real active accounts, normalized active/effective assignments, role
   scopes, employee bindings, current assignments, and active companies.
3. Derive only approved mappings:
   - tenant scope → all active tenant companies;
   - company scope → referenced active companies;
   - own scope → unambiguous effective employee company;
   - multiple roles → union.
4. Select a default only when one company exists or the unambiguous employee
   company is in the allowed union.
5. Upsert traceable compatibility-backfill rows. Do not delete stale or
   ambiguous records; report them for review.
6. Return examined/inserted/updated/unchanged/skipped/ambiguous/conflict counts
   without personal data.
7. Re-running must produce no duplicates or contradictory defaults.
8. Add a shadow projection reader that compares legacy role-scope decisions
   with user-company-intersection decisions without changing authority.

**Safety verification**

- source rows and authorization decisions remain unchanged;
- first and second runs converge;
- failure injection rolls back all mutations;
- tenant RLS is restored before commit and after rollback;
- security mismatches are classified and block activation;
- migration rollback leaves additive data unused, not deleted.

### Task 4 — Add user-management and first-password contracts

**Files**

- Create: `packages/contracts/src/security/user-administration.ts`
- Modify: `packages/contracts/src/security/index.ts`
- Modify: `packages/contracts/src/security/administration.ts`
- Modify: `packages/contracts/src/auth/index.ts`
- Modify: `packages/contracts/src/openapi-c4.ts`
- Modify: `packages/contracts/src/generate-client-c4.ts`
- Regenerate: `openapi-v1.json`
- Regenerate: `apps/web/src/lib/api/generated.ts`
- Modify: `tests/contract/openapi.test.ts`
- Create: `tests/unit/user-administration-contracts.test.ts`

**Contracts**

1. Define strict schemas for:
   - bounded user filters/page and safe user detail;
   - create/update/submit user request;
   - user proposal identity, companies/default, employee link, initial roles,
     lifecycle action, and password-reset intent;
   - emergency `lock` and `revoke_sessions` actions with reason;
   - transient credential delivery in a non-replayable response extension;
   - eligible company/employee/role option projections.
2. Extend approval resource type to `user` without changing existing role and
   assignment payloads.
3. Extend password-login response with `password_change_required` carrying only
   opaque ticket and expiry.
4. Add strict initial-password-change request/response schemas.
5. Generate API methods for the new security and auth endpoints; do not hand
   edit generated artifacts.

**Contract safeguards**

- no tenant ID, user authority, role authority, password hash, session version,
  or trusted company scope is accepted from an untrusted browser where it can
  be derived server-side;
- one-time password appears only in the first successful administration
  response schema and is absent on replay;
- public problem responses remain generic and safe.

### Task 5 — Add session-version and reset-required authentication domain logic

**Files**

- Modify: `packages/auth/src/tenant-sessions.ts`
- Modify: `packages/auth/src/tenant-authentication.ts`
- Create: `packages/auth/src/password-change.ts`
- Modify: `packages/auth/src/index.ts`
- Modify: `apps/api/src/modules/auth/redis-session-store.ts`
- Create: `tests/unit/password-change.test.ts`
- Modify: `tests/unit/tenant-sessions.test.ts`
- Modify: `tests/unit/tenant-authentication.test.ts`

**Work**

1. Add `sessionVersion` to Redis session records/views and preserve backward
   compatibility for version-1 sessions created before deployment.
2. Require current PostgreSQL account session version before issuing a session;
   preserve the version during rotation.
3. Carry reset-required credential state and password version in verified
   account results without exposing them in the normal session response.
4. Implement a focused password-change service that:
   - generates 256-bit opaque single-use tickets;
   - stores tenant/user/credential-version/request-context authority in Redis;
   - uses a short TTL and atomic Lua consume/cancel operations;
   - validates 12–128-character replacement passwords and difference from the
     one-time password;
   - never stores plaintext passwords or raw request context.
5. Cover expiry, replay, cancellation, concurrent consume, credential-version
   change, account status change, and Redis failure.

### Task 6 — Integrate first-password change into the production auth path

**Files**

- Modify: `apps/api/src/modules/auth/source-repository.ts`
- Create: `apps/api/src/modules/auth/redis-password-change-store.ts`
- Modify: `apps/api/src/modules/auth/tenant-router.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/app.ts` only for typed dependency wiring
- Modify: `tests/integration/c4-source-auth.test.ts`
- Create: `tests/integration/redis-password-change.test.ts`
- Create: `tests/security/first-password-change-security.test.ts`

**Request flow**

1. Credential verification continues to evaluate every bounded tenant
   candidate and retains generic invalid-credential behavior.
2. After a single membership or selected membership is resolved:
   - normal credential → issue the existing server-side session with current
     session version;
   - reset-required credential → issue only a password-change ticket and no
     session cookie.
3. `POST /api/v1/auth/change-initial-password` consumes the ticket, rechecks
   tenant/user/status/credential/password/session versions under tenant RLS,
   writes the new Argon2 verifier and safe authentication event transactionally,
   advances password version, clears reset-required state, and issues a normal
   session.
4. Every session restore, mutation authorization, rotation, and protected-route
   context compares Redis session version with current PostgreSQL account
   version. Mismatch revokes/clears the cookie and denies.

**Required cases**

- single- and multi-membership reset-required login;
- no normal cookie before password change;
- replay/expired/context-mismatched/changed-credential ticket denial;
- old password denial after change;
- session-version mismatch denial even when Redis cleanup is unavailable;
- existing login, selection, refresh, rotation, logout, and logout-all remain
  green.

### Task 7 — Implement transactional governed user administration

**Files**

- Create: `apps/api/src/modules/security/source-user-administration.ts`
- Modify: `apps/api/src/modules/security/source-administration-repository.ts`
- Modify: `tests/integration/source-security-fixture.ts`
- Create: `tests/integration/governed-user-administration.test.ts`

**Boundary**

Keep `SourceSecurityAdministrationRepository` as transaction/idempotency/audit
owner. Put user-specific normalization, validation, SQL projections, and state
comparison in the focused user-administration module. Do not create a second
command or audit implementation and do not broadly refactor existing role or
assignment behavior.

**Repository methods**

- list users and load user detail;
- list eligible companies/employees/roles;
- create a draft user request;
- update/submit a draft;
- decide a submitted user request;
- execute emergency lock/revoke-sessions command;
- produce company-scope shadow comparison.

**Approval transaction**

For account creation, atomically create account, company grants, optional
employee binding, initial role assignments, Argon2 credential, completed
administration command, and audit events. For edits, lock current account,
request, grants, bindings, assignments, and tenant-administrator coverage before
applying the approved delta.

Generate the one-time password inside the approval operation. Attach it only to
the in-memory first response after the database commit. Persist only the
verifier. An idempotent replay returns the stored safe projection with
`credential_delivery` absent and `credential_delivery_available=false`.

**Enforcement**

- exact permissions and allowed source states;
- delegation ceiling for roles and companies;
- maker/checker and target/checker separation;
- tenant/company/employee foreign-boundary checks;
- duplicate username/email and active employee-binding rejection;
- initial role SoD;
- valid lifecycle transitions;
- row-version concurrency;
- transaction-scoped last-administrator lock and post-change coverage;
- archive retains all history and advances session version;
- reset, lock, revoke, archive, and deactivate advance session version.

### Task 8 — Expose production security APIs and session cleanup

**Files**

- Modify: `apps/api/src/modules/security/router.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.ts`
- Create/modify: `tests/integration/security-user-router.test.ts`
- Modify: `tests/security/foundation-security.test.ts`

**Routes**

- `GET /api/v1/security/users`
- `GET /api/v1/security/users/:userId`
- `GET /api/v1/security/user_options`
- `POST /api/v1/security/user_requests`
- `POST /api/v1/security/user_request_actions`
- existing `POST /api/v1/security/approval_actions` with `resource_type=user`
- `POST /api/v1/security/user_emergency_actions`

Use existing no-store, origin, CSRF, session, tenant-header rejection,
idempotency, problem-details, and correlation conventions. Do not accept a
tenant ID in mutation bodies.

After a committed session-version change, invoke idempotent Redis `revokeAll`
as cleanup. A Redis cleanup failure is logged safely and retried through the
existing operational mechanism if one is available; the PostgreSQL
session-version check remains the security authority.

### Task 9 — Implement the Users tab and governed user workflows

**Files**

- Modify: `apps/web/src/features/security/identity-workspace.tsx`
- Modify: `apps/web/src/features/security/identity-workspace.module.css`
- Create: `apps/web/src/features/security/users/user-management-panel.tsx`
- Create: `apps/web/src/features/security/users/user-management.module.css`
- Create: `apps/web/src/features/security/users/user-wizard.tsx`
- Create: `apps/web/src/features/security/users/user-detail.tsx`
- Modify: `apps/web/src/lib/auth/session-client.ts`
- Modify: `apps/web/src/lib/session/session-provider.tsx`
- Modify: `apps/web/app/login/page.tsx`
- Modify: `apps/web/app/login/login.module.css`
- Modify: `tests/e2e/foundation.spec.ts`
- Modify: `tests/unit/web-session-client.test.ts`

**Users workspace**

1. Add Users to the existing tab array and query-string deep linking.
2. Build server-backed summary, bounded search, filters, pagination, table,
   empty/loading/unauthorized/error states, and detail panel.
3. Build the five-step create/edit flow:
   - identity;
   - employee link;
   - allowed/default companies;
   - initial roles;
   - review/submit.
4. Add permission-aware actions for edit, activate/unlock, deactivate/archive,
   password reset, role assignment link, lock, session revoke, and audit.
5. Extend Approvals to display and decide user requests.
6. Render one-time credential delivery only from the live first approval
   response. Keep it in component memory, mark it unavailable on replay, and
   clear it on close/navigation/refresh/logout.
7. Keep later role mutations on the existing assignment contract and show their
   status in user detail.

**Login workspace**

1. Handle `password_change_required` in place after credential or tenant
   selection.
2. Provide new-password and confirmation fields, accessibility, focus, loading,
   generic expiry/retry, and cancel behavior.
3. Never put the ticket/password in URL, localStorage, sessionStorage, or a
   client-controlled cookie.
4. Navigate to `/admin/identity` only after a normal session is issued.

### Task 10 — Extend controlled synthetic UAT provisioning

**Files**

- Modify: `tests/integration/source-security-fixture.ts`
- Create: `scripts/provision-user-management-uat.ts`
- Modify: root `package.json`
- Create: `docs/evidence/consolidation/governed-user-management-manual-gate.md`

**Work**

1. Reuse synthetic maker, checker, target, restricted, and two administrator
   identities in the isolated UAT tenant.
2. Add exact least-privilege user-account permissions, source-state rules,
   delegations, two active companies, optional synthetic employee candidates,
   and company grants.
3. Require explicit UAT environment confirmation and secret/password inputs;
   never hardcode a production credential.
4. Make provisioning transactional, idempotent, and count-only in output.
5. Preserve the simple local `admin`/`Admin123` review credential only in the
   current disposable database; do not encode that weak password into source or
   the production provisioning path.

### Task 11 — Complete PostgreSQL, security, concurrency, and performance tests

**Files**

- Expand: `tests/integration/governed-user-administration.test.ts`
- Expand: `tests/integration/security-user-router.test.ts`
- Create: `tests/security/user-management-security.test.ts`
- Create: `tests/performance/user-management-performance.test.ts`
- Modify: `tests/integration/c4-security-administration.test.ts`
- Modify: `tests/integration/authorization-policy.test.ts` only where the new
  company maximum boundary is shadow-evaluated

**Required evidence**

- create/edit/activate/unlock/deactivate/archive/reset lifecycle;
- maker cannot approve own request; target cannot approve sensitive self-change;
- direct API denial and exact permission separation;
- role/company delegation ceiling and privilege escalation denial;
- role SoD and last-administrator protection;
- cross-tenant user/company/employee/request/approval denial;
- transaction rollback at each mutation stage;
- duplicate idempotency request and changed-payload conflict;
- concurrent approval, lock, archive, administrator removal, and reset;
- inactive/locked/archived account and revoked/expired assignment behavior;
- one-time password absence from database, command, audit, logs, responses on
  replay, and client persistence;
- session-version fail-closed behavior;
- immutable audit evidence and complete correlation;
- existing authorization parity remains unchanged;
- indexed bounded user search and realistic-volume list/detail/backfill timing.

### Task 12 — Run complete automated gate

Ensure PostgreSQL, Redis, and MinIO test services are healthy, then run from the
canonical repository root:

```powershell
npm.cmd run api:generate
npm.cmd run api:check
npm.cmd run format:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:unit
npm.cmd run test:contract
npm.cmd run test:integration
npm.cmd run test:security
npm.cmd run test:performance
npm.cmd run test:legacy
npm.cmd run test:a11y
npm.cmd audit --omit=dev
```

Run E2E and visual/manual evidence only through the approved browser workflow.
Do not substitute standalone Playwright or claim browser success when no
approved backend is available.

Record commands, exit codes, test counts, dependency endpoints, migration
version, backfill counts, parity comparisons/mismatches, and timing. Separate
pre-existing failures from regressions introduced by this work.

### Task 13 — Execute governed User Management Manual Gate and stop

Use the approved browser workflow and synthetic UAT identities to verify:

1. maker creates and submits a user;
2. maker self-approval denial;
3. checker rejection and approved resubmission;
4. one-time password display exactly once;
5. first login requires password change and then issues a normal session;
6. refresh persistence and logout;
7. identity edit and stale-version conflict;
8. multiple companies/default and company isolation;
9. employee link and duplicate-link denial;
10. initial role and later role grant/revoke with delegation and SoD denial;
11. immediate lock and active-session denial;
12. governed unlock and password reset;
13. deactivate/archive and denied login;
14. restricted-user/direct-API denial;
15. cross-tenant denial;
16. concurrent last-administrator protection;
17. idempotent repeated operations;
18. append-only audit evidence;
19. Users and Approvals deep links inside `/admin/identity`;
20. existing Roles, Assignments, Permissions, and Audit tabs remain functional.

Fix only defects inside the approved user-management scope, rerun affected
suites, and repeat failed manual scenarios. Stop after the manual gate and
report whether company-access activation for legacy accounts is ready for a
separate explicit decision.

## 4. Planned File Impact

| Area | Planned changes |
| --- | --- |
| PostgreSQL | security migration 0008, company-access backfill and CLI |
| Auth domain | session version and password-change ticket service |
| API auth | credential state, Redis ticket store, first-change route |
| API security | user repository helpers, governed methods, routes, cleanup |
| Contracts | user administration and first-change schemas/OpenAPI/client |
| Web | Users tab, list/detail/wizard, approval, credential panel, login state |
| Fixtures/UAT | exact permissions, companies, synthetic identities, evidence |
| Tests | unit, contract, PostgreSQL/Redis integration, security, performance, UI/regression |
| Documentation | rollout runbook and manual-gate evidence |

## 5. Stop Conditions

Stop and report before proceeding if any of these occur:

- migration changes existing account, credential, assignment, employee, or
  audit data unexpectedly;
- company backfill has a security-sensitive mismatch or ambiguous expansion;
- one-time credentials appear in persisted or logged data;
- session-version mismatch can still authorize a protected request;
- maker/checker, tenant/company isolation, delegation, SoD, or last-admin
  protection fails;
- approval or emergency action leaves partial state;
- existing authorization parity regresses;
- approved browser evidence cannot be produced.

Do not activate legacy company-access enforcement, begin unrelated work, or
create a commit without separate explicit approval.

## 6. Completion Report

Report:

1. files changed;
2. database migration and backfill counts;
3. user-management APIs and UI delivered;
4. authentication/session changes;
5. existing behavior preserved;
6. maker-checker, SoD, delegation, last-admin, concurrency, and idempotency
   results;
7. tenant/company/employee isolation results;
8. credential and session security results;
9. audit verification;
10. contract, build, test, security, performance, regression, and manual-gate
    results;
11. working-tree status;
12. remaining risks or blockers;
13. exact recommendation on legacy company-access activation.
