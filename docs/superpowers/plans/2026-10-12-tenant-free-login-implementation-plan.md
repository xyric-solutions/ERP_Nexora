# Nexora Tenant-Free Username/Email Login Implementation Plan

- Status: approved design; implementation awaiting execution approval
- Date: 2026-10-12
- Canonical repository: `E:\XS\Xyric Solutions LLP\prototype_ERP`
- Source design: `../specs/2026-10-12-tenant-free-login-design.md`
- Parent gate: C4 Manual Gate 1
- Scope boundary: authentication discovery and organization selection only

## 1. Outcome

Replace the public tenant/email/password login request with username-or-email
and password. Preserve the existing tenant-scoped PostgreSQL accounts,
credentials, normalized authorization, Redis sessions, CSRF protection, and
authorization semantics.

One verified membership creates the existing tenant-bound session. Multiple
verified memberships require selection through a five-minute, single-use,
Redis-backed pre-authentication ticket. No tenant ID, user ID, role,
permission, or account state supplied by the browser is trusted.

This plan does not authorize C5/R08, C6/R09, MFA, OIDC, SAML, account recovery,
self-registration, tenant switching after login, destructive migration,
repository cleanup, or a commit.

## 2. Existing implementation to preserve

| Concern                         | Existing authority                                       | Required treatment                                                        |
| ------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------- |
| Tenant accounts and credentials | `security_user_account`, `security_password_credential`  | Preserve rows, IDs, hashes, and tenant RLS                                |
| Password validation             | `packages/auth/src/passwords.ts`                         | Reuse compatible verification and successful PBKDF2-to-Argon2 upgrade     |
| Login throttling                | `RedisLoginThrottleStore`                                | Retain identifier/network limits; remove tenant from the identifier key   |
| Sessions                        | `TenantSessionService`, `RedisTenantSessionStore`        | Preserve opaque tokens, fixation prevention, expiry, revocation, and CSRF |
| Authorization                   | normalized PostgreSQL policies plus compatibility parity | No behavior or authority change                                           |
| API errors                      | Express `HttpError` and problem details                  | Preserve generic credential and safe dependency errors                    |
| UI                              | `/login` and `SessionProvider`                           | Remove tenant input; add an in-place organization-selection state         |
| Contracts                       | Zod, OpenAPI, generated web client                       | Change together; generated artifacts remain generated                     |

## 3. Security and rollout invariants

1. Cross-tenant discovery is exposed only through a narrowly scoped database
   function accepting keyed identifier digests. The normal application role
   receives no direct login-directory table privilege.
2. Email and username digests use HMAC-SHA-256 with
   `AUTH_LOGIN_DIRECTORY_SECRET`, which must differ from throttle and session
   secrets.
3. Candidate resolution returns only tenant/user references. Credentials,
   tenant labels, roles, and permissions are loaded later under the candidate's
   tenant RLS context.
4. The service verifies every bounded candidate before deciding. It does not
   stop on the first password match.
5. An excessive or ambiguous candidate set fails closed and emits only safe,
   non-identifying telemetry.
6. Tenant labels are returned only after password verification.
7. A selection ticket contains no trusted state in the browser. Redis is the
   authority, consumption is atomic, and account state is reloaded before a
   session is issued.
8. Existing session cookies, origin checks, CSRF validation, session rotation,
   logout, logout-all, idle expiry, and absolute expiry are unchanged.
9. The old public tenant-bearing request is removed only after migration
   coverage and the new API/web build pass together. The tenant-aware
   repository read remains available internally for session restoration.
10. No raw identifier, password, password hash, session token, pre-auth ticket,
    or identifier HMAC is logged or added to audit evidence.

## 4. Implementation sequence

### Task 1 — Characterize the current boundary before changing it

**Files**

- Modify: `tests/unit/tenant-authentication.test.ts`
- Modify: `tests/unit/web-session-client.test.ts`
- Modify: `tests/integration/c4-source-auth.test.ts`
- Modify: `tests/e2e/foundation.spec.ts`
- Read/retain: `tests/security/**`

**Work**

1. Preserve assertions for generic invalid credentials, successful password
   hash upgrade, live authorization reload, secure cookie attributes, session
   rotation, CSRF, logout, and removed MFA routes.
2. Add failing characterization cases for the approved new behavior:
   identifier-only request, single membership, multiple memberships,
   username/email normalization, and no tenant textbox.
3. Keep all assertions against public behavior. Do not weaken existing tests
   merely because the contract changes.

**Initial commands**

```powershell
npm.cmd run test:unit -- --run tests/unit/tenant-authentication.test.ts tests/unit/web-session-client.test.ts
npm.cmd run test:integration -- --run tests/integration/c4-source-auth.test.ts
```

The new assertions must fail for the expected missing behavior before
implementation.

### Task 2 — Add the restricted PostgreSQL login directory

**Files**

- Create: `packages/db/source-migrations/security/0007_tenant_free_login_directory.forward.sql`
- Modify: `tests/integration/postgres-migrations.test.ts`
- Create: `tests/security/login-directory-privileges.test.ts`

**Schema**

Create `security_login_identifier` with:

- `tenant_id`, `user_id`, and foreign key to `security_user_account`;
- `identifier_kind` constrained to `email` or `username`;
- fixed-length lowercase HMAC-SHA-256 digest;
- lifecycle state constrained to `active` or `inactive`;
- source reference and created/updated timestamps;
- primary/unique keys preventing duplicate mappings for the same account;
- an indexed lookup on `(identifier_kind, identifier_hmac, lifecycle_state)`;
- tenant index for deterministic reconciliation.

Create a narrowly scoped `SECURITY DEFINER` candidate-resolution function with
a fixed safe `search_path`. It accepts the two identifier-kind digests, applies
an explicit result limit, and returns only `tenant_id` and `user_id`. Revoke
public function execution and direct application-role table access, then grant
only function execution to the production application role when that role is
present. The migration must remain runnable in isolated test databases whose
owner role differs from production.

Enable and force RLS on the table for tenant-scoped administration. Direct
tenant-scoped writes use `nexora.tenant_id`; cross-tenant reads occur only in
the restricted resolver owned by the migration role. Tests must inspect ACLs,
RLS flags, function security mode/search path, constraints, and query-plan
index use rather than assuming the function is safe from its name.

Add an append-only `security_authentication_event` relation for trusted
post-verification outcomes. It is tenant scoped, references the resolved user,
contains only safe event categories/correlation metadata, and rejects update
or delete. Pre-verification denials remain redacted structured telemetry because
no tenant or actor is yet trusted.

**Migration safety**

- Record version 7 as `tenant_free_login_directory` in the existing migration
  ledger.
- Do not rewrite or delete any existing account, credential, session,
  authorization, audit, or MFA-history row.
- The SQL migration creates structures only; keyed backfill is an explicit
  controlled step in Task 3 because the HMAC secret must not be embedded in SQL
  or the database.

### Task 3 — Implement deterministic, idempotent directory backfill

**Files**

- Create: `packages/db/src/login-directory-backfill.ts`
- Create: `packages/db/src/backfill-login-directory-cli.ts`
- Modify: `packages/db/src/index.ts`
- Modify: `packages/db/package.json`
- Modify: root `package.json`
- Create: `tests/integration/login-directory-backfill.test.ts`
- Create: `docs/runbooks/tenant-free-login-rollout.md`

**Work**

1. Require a migration connection and `AUTH_LOGIN_DIRECTORY_SECRET`; never
   accept or print a default secret.
2. Acquire a dedicated PostgreSQL advisory lock and run the entire scan/upsert
   in one transaction.
3. Because the migration owner is subject to forced RLS, temporarily change
   only the migration owner's treatment from `FORCE ROW LEVEL SECURITY` to
   normal RLS for the source/directory relations inside the transaction. Do
   not disable RLS. The application role remains subject to RLS throughout.
   Restore `FORCE ROW LEVEL SECURITY` before commit; rollback restores it
   automatically on failure.
4. Normalize every existing account email and credential username, calculate
   kind-separated HMAC digests in Node.js, and upsert traceable mappings.
5. Do not delete stale rows. Mark a mapping inactive only when the authoritative
   source is unambiguously inactive; report conflicting or invalid source rows
   without guessing.
6. Return examined/inserted/updated/unchanged/skipped/conflict counts without
   raw identifiers or HMACs.
7. Re-running with the same source and secret must create zero duplicates and
   produce the same active mapping set.
8. Detect secret mismatch against existing mappings and stop before mutation;
   secret rotation requires a separately controlled full rebuild procedure.

**Verification**

- Existing account and credential row hashes/counts remain unchanged.
- First and second runs reconcile exactly.
- Failure injection rolls back every directory mutation and leaves forced RLS
  active.
- Invalid/ambiguous rows appear in the exception result.
- A runtime application connection cannot select the directory directly.

The runbook must specify migration, backfill, coverage verification, API/web
deployment, health validation, and safe rollback to the previous application
version without dropping the additive schema.

### Task 4 — Change the authentication domain to identifier discovery

**Files**

- Modify: `packages/auth/src/tenant-authentication.ts`
- Modify: `packages/auth/src/index.ts` only if a new focused module is created
- Modify: `apps/api/src/modules/auth/source-repository.ts`
- Modify: `tests/unit/tenant-authentication.test.ts`
- Create/modify: `tests/security/tenant-free-login.test.ts`

**Domain changes**

1. Replace the public input `{tenantId, email, password}` with
   `{identifier, password, sourceIp}`.
2. Normalize one identifier and create independent HMAC messages for `email`
   and `username` using domain separation.
3. Change the identifier throttle key to depend on normalized identifier only;
   retain the independent network throttle key and existing policies.
4. Extend the repository with:
   - bounded candidate discovery by HMAC digests;
   - tenant-scoped credential load by tenant/user reference;
   - existing live account/authorization load;
   - existing conditional hash upgrade;
   - trusted authentication-event append.
5. For no candidates, verify one dummy Argon2 hash. For candidates, verify all
   bounded hashes before evaluating results.
6. Exclude inactive/locked accounts and missing/ineligible credentials with
   the same external invalid result.
7. Deduplicate matches by tenant/user. If more than one verified account maps
   to the same tenant, treat it as a data-quality/security ambiguity and fail
   closed rather than selecting one.
8. Load current authorization and the tenant's safe display name under each
   verified tenant context. A parity mismatch remains fail closed.
9. Upgrade legacy hashes only for successfully verified memberships and retain
   compare-and-swap semantics.
10. Return `invalid`, `throttled`, or `verified` with one or more eligible
    accounts. Do not return candidates when password verification fails.

**Tests**

- email and username normalization;
- unknown identity versus wrong-password equivalence;
- same identifier across tenants with same and different passwords;
- inactive/locked/missing account exclusion;
- bounded-candidate overflow and within-tenant ambiguity fail closed;
- all candidate hashes evaluated;
- successful-only password upgrade;
- tenant/company authorization data still comes from the normalized live read;
- no raw identifier/HMAC/password in log or audit payloads.

### Task 5 — Add the Redis pre-authentication ticket authority

**Files**

- Create: `packages/auth/src/tenant-selection.ts`
- Modify: `packages/auth/src/index.ts`
- Create: `apps/api/src/modules/auth/redis-tenant-selection-store.ts`
- Create: `tests/unit/tenant-selection.test.ts`
- Create: `tests/integration/redis-tenant-selection.test.ts`
- Create/modify: `tests/security/tenant-free-login.test.ts`

**Work**

1. Generate a 256-bit opaque ticket and independent opaque choice identifiers.
2. Store only the server-authoritative tenant/user mappings, safe display
   labels, issued/expiry timestamps, and an HMAC-bound request-context
   fingerprint in Redis.
3. Use a dedicated Redis namespace, five-minute TTL, and no persistent browser
   storage.
4. Implement atomic Lua operations for create, consume, and cancel. Consume
   must distinguish only internal outcomes; the public error remains generic.
5. Bind tickets to the verified request context using a domain-separated HMAC;
   do not store raw source IP or user-agent in the ticket record.
6. On selection, atomically consume the ticket before session issuance, confirm
   the opaque choice existed, reload the tenant account/authorization state,
   and fail closed if it changed or became inactive.
7. Cancel consumes/deletes the ticket. Expired, replayed, tampered, concurrent,
   context-mismatched, and unoffered choices never issue a session.

**Tests**

- TTL and namespace isolation;
- one successful consume only under concurrent attempts;
- invalid/replayed/expired/context-mismatched ticket denial;
- unoffered choice denial and ticket invalidation;
- cancellation;
- Redis failure returns safe 503 and no session;
- ticket payload has no password, hashes, roles, permissions, raw identifier,
  raw IP, or raw user-agent.

### Task 6 — Change the public API and session issuance flow

**Files**

- Modify: `packages/contracts/src/auth/index.ts`
- Modify: `packages/contracts/src/openapi-c4.ts`
- Modify: `packages/contracts/src/generate-client-c4.ts`
- Regenerate: `openapi-v1.json`
- Regenerate: `apps/web/src/lib/api/generated.ts`
- Modify: `apps/api/src/modules/auth/tenant-router.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/app.ts` only for dependency typing/wiring if required
- Modify: `tests/contract/openapi.test.ts`
- Modify: `tests/integration/c4-source-auth.test.ts`

**Contract**

- `POST /api/v1/auth/login` accepts `{identifier,password}`.
- Its HTTP 200 response is a discriminated union:
  - the existing `status: authenticated` session response; or
  - `status: tenant_selection_required` with opaque `ticket`, expiry, and an
    array of opaque choice IDs plus safe organization labels.
- `POST /api/v1/auth/select-tenant` accepts `{ticket,choice_id}` and returns the
  existing authenticated session response.
- `POST /api/v1/auth/cancel-tenant-selection` accepts `{ticket}` and returns
  204 after safe idempotent invalidation.

All three unauthenticated mutation routes retain trusted-origin validation and
`cache-control: no-store`. Selection/cancel never accept tenant or user IDs.
Invalid credential and invalid selection responses remain generic. The final
session cookie is issued only after one authoritative tenant/user is resolved;
the pre-existing session token, if any, is revoked/replaced using the current
fixation-prevention behavior.

Regenerate OpenAPI and the web client from the contract source; do not hand
edit generated artifacts.

### Task 7 — Add independent secret configuration and deployment wiring

**Files**

- Modify: `apps/api/src/config.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `.env.example`
- Modify: `compose.yaml`
- Modify: `compose.test.yaml` if the API service is defined there
- Modify: `tests/unit/foundation.test.ts`
- Modify: deployment/runbook documentation only where this variable is listed

**Work**

1. Add required `AUTH_LOGIN_DIRECTORY_SECRET` with the existing 32-byte minimum
   and 512-byte maximum.
2. Enforce pairwise inequality among login-directory, throttle, and session
   secrets.
3. Pass the variable to the API and explicit backfill command. Do not expose it
   to the browser, logs, Docker image layers, OpenAPI, health payloads, or test
   evidence.
4. Use obvious non-secret placeholders in `.env.example`; never invent a real
   value.

### Task 8 — Implement the two-step login UI in the existing workspace

**Files**

- Modify: `apps/web/app/login/page.tsx`
- Modify: `apps/web/app/login/login.module.css` only as needed for the approved
  existing visual language and responsive selection state
- Modify: `apps/web/src/lib/auth/session-client.ts`
- Modify: `apps/web/src/lib/session/session-provider.tsx`
- Modify: `tests/unit/web-session-client.test.ts`
- Modify: `tests/e2e/foundation.spec.ts`
- Add a focused component test only if the current test infrastructure supports
  it without a new dependency

**Behavior**

1. Remove the tenant state, label, input, autocomplete, validation, and tenant-
   specific error text.
2. Label the first control `Username or email`, retain
   `autocomplete="username"`, and keep the password control unchanged.
3. Let the session client return the login discriminated union. Set CSRF/session
   state only for `authenticated`; never treat selection-required as a session.
4. Replace the form in place with accessible organization choices when needed.
   Preserve keyboard operation, focus management, loading state, expiry
   feedback, generic error recovery, and responsive layout.
5. Submit only the opaque choice ID and ticket. On success, navigate to
   `/admin/identity` as today.
6. Back/cancel invokes the cancel endpoint, clears password and ticket state,
   and returns focus to the identifier input.
7. Do not store the password, ticket, choice IDs, CSRF token, or authorization
   state in localStorage, sessionStorage, a URL, or a client-controlled cookie.
8. Page refresh during selection returns safely to credential entry; refresh
   after authentication restores the existing server-side session.

### Task 9 — Extend PostgreSQL/Redis/API security integration coverage

**Files**

- Modify: `tests/integration/c4-source-auth.test.ts`
- Create: `tests/integration/login-directory-backfill.test.ts`
- Create: `tests/integration/redis-tenant-selection.test.ts`
- Create/modify: `tests/security/tenant-free-login.test.ts`
- Modify: `tests/performance/**` only for a focused candidate-lookup test if
  existing performance conventions support it

**Required cases**

1. Single-tenant email and username login issue a session directly.
2. Multiple verified memberships return only safe organization choices and
   issue no cookie before selection.
3. Same identifier with different tenant passwords exposes only the verified
   membership.
4. Selection issues a session for the offered choice and tenant only.
5. Direct tenant/user injection, cross-tenant choices, replay, expiry, and
   concurrent consumption fail closed.
6. Unknown identifier, wrong password, inactive account, and locked account
   retain generic denial.
7. Identifier and network throttles operate without a tenant field.
8. Fixation prevention, secure cookie flags, CSRF, origin checks, rotation,
   expiry, revocation, logout, and refresh persistence remain green.
9. Existing RBAC, company scope, field restrictions, maker-checker, SoD,
   last-administrator, idempotency, immutable audit, and authorization parity
   remain green.
10. Directory lookup is indexed and bounded under a realistic synthetic
    membership volume.

Tests use the real PostgreSQL and Redis test services as authorities. Mocks may
unit-test pure branching but cannot satisfy the integration/security gate.

### Task 10 — Provision controlled C4 UAT credentials without hardcoding secrets

**Files**

- Modify: `tests/integration/source-security-fixture.ts` only for reusable
  deterministic identifiers; do not put plaintext credentials in it
- Create: `scripts/provision-c4-uat-auth.ts`
- Create: `docs/evidence/consolidation/C4-tenant-free-login-manual-gate.md`

**Work**

1. Reuse the isolated `nexora-r06-uat` tenant and existing six synthetic
   identities: maker, checker, target, restricted, last-admin A, and last-admin
   B.
2. Accept the UAT password only from a process environment variable or approved
   secret source. Do not echo it, write it to source/evidence, or create a
   default.
3. Upsert only missing password credentials and login-directory mappings in a
   transaction; preserve existing authorization assignments and Demo/business
   data.
4. Make provisioning idempotent and report identifiers/counts only.
5. Add a second isolated synthetic tenant membership for one approved identity
   solely to prove the organization-selection branch. Give it no unnecessary
   authorization.
6. Verify tenant/company isolation and least privilege after provisioning.

Persistent UAT data is created only in the controlled non-production database.
No production or unrelated Demo record is modified.

### Task 11 — Run the full automated gate

Run from the canonical root with the approved PostgreSQL/Redis/MinIO services:

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
```

Run the repository E2E suite only through its approved browser workflow. Do not
substitute fabricated evidence. Record command, exit code, pass/fail/skip
counts, dependency endpoints, and duration in the C4 evidence file. Any test
not executed is `NOT RUN`, never `PASS`.

Also verify:

- `npm audit` reports and classifies dependency findings without unrelated
  upgrades;
- source migration state reports security version 7;
- readiness reports API, PostgreSQL, Redis, and object storage healthy;
- OpenAPI and generated client have no drift;
- `git status --short --branch` shows no unexplained or discarded user work.

### Task 12 — Execute C4 Manual Gate 1 and stop

Using the approved browser workflow against the PostgreSQL-backed C4 runtime,
record genuine evidence for:

1. username login and email login;
2. single-membership direct entry;
3. multi-membership organization selection;
4. cancel/back and expired-ticket recovery;
5. invalid credentials and unauthorized-user denial;
6. browser refresh/session persistence, logout, and revoked-session denial;
7. direct and deep links to Roles, Assignments, Approvals, Permissions, and
   Audit within `/admin/identity`;
8. role creation/editing, permission assignment, and role assignment;
9. maker submission, checker approval, checker rejection, and SoD denial;
10. last-administrator protection and idempotent retries;
11. tenant/company isolation and append-only audit evidence.

Capture timestamps, identity labels, expected/actual outcomes, relevant
correlation IDs, and approved screenshots/recordings without secrets. Fix only
defects inside this approved authentication/C4 scope, rerun affected suites,
then rerun the failed manual scenario.

Stop after C4. Do not start C5/R08 until all automated checks and Manual Gate 1
pass and the user approves the C4 completion report.

## 5. Rollback and failure handling

1. Migration and backfill are additive. A failed SQL migration rolls back;
   existing tenant-aware authentication remains deployable.
2. A failed backfill transaction changes neither source credentials nor
   directory coverage and restores forced RLS.
3. Do not deploy the new public login contract until directory coverage is
   complete for all eligible accounts in the target environment.
4. If API/web deployment fails, roll back both application artifacts together.
   Leave migration 7 and directory data in place; do not drop them.
5. If Redis selection storage is unavailable, fail closed with 503. Do not
   issue a session or fall back to trusting a client tenant.
6. If candidate ambiguity, secret mismatch, parity mismatch, or cross-tenant
   leakage is detected, stop the rollout, preserve evidence, and report it as a
   security blocker.
7. Never use `git reset`, `git clean`, destructive database commands, Docker
   prune, or deletion of user-owned files as rollback mechanisms.

## 6. Acceptance checklist

- [ ] Login form contains only username/email and password.
- [ ] Public login requests contain no tenant field.
- [ ] Login directory schema, ACLs, RLS, function, constraints, and indexes are
      verified on real PostgreSQL.
- [ ] Backfill is complete, deterministic, idempotent, and non-destructive.
- [ ] One verified membership issues the existing tenant-bound Redis session.
- [ ] Multiple verified memberships require a single-use Redis ticket and safe
      organization selection.
- [ ] No pre-verification tenant disclosure or direct client tenant trust is
      possible.
- [ ] Invalid/replayed/expired/concurrent selection attempts fail closed.
- [ ] Session, CSRF, cookie, expiry, revocation, and logout invariants pass.
- [ ] Authorization, tenant/company scope, maker-checker, SoD, last-admin,
      idempotency, private fields, parity, and audit regressions pass.
- [ ] Contract, OpenAPI, generated client, unit, PostgreSQL, Redis, security,
      performance, frontend, accessibility, build, and legacy checks are
      recorded truthfully.
- [ ] Manual Gate 1 passes with genuine approved-browser evidence.
- [ ] No known C4 blocker remains.
- [ ] C5/R08 has not started.

## 7. Planned file impact summary

| Area               | Planned files                                                               |
| ------------------ | --------------------------------------------------------------------------- |
| Database           | security migration 0007, backfill library/CLI, DB exports/scripts           |
| Auth domain        | `tenant-authentication.ts`, new tenant-selection abstraction                |
| API infrastructure | source auth repository, Redis ticket store, router, server/config wiring    |
| Contracts          | auth schemas/types, OpenAPI source, generator, generated OpenAPI/client     |
| Web                | login page/styles, browser session client, session provider                 |
| Deployment         | `.env.example`, Compose secret pass-through, rollout runbook                |
| Tests              | unit, contract, PostgreSQL, Redis, security, E2E/accessibility, regressions |
| Evidence/UAT       | controlled credential provisioning and C4 Manual Gate record                |

No unrelated HR/Payroll, prototype-design, desktop, mobile, extension,
authorization-policy, or navigation file is in scope.
