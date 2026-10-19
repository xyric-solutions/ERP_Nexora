# Nexora No-MFA Final Authentication Cleanup Design

- Date: 2026-10-10
- Status: implemented and automated verification complete
- Canonical repository: `E:\XS\Xyric Solutions LLP\prototype_ERP`
- Authentication authority: email/password plus opaque server-side PostgreSQL/Redis sessions

## 1. Objective

Remove the dormant MFA and superseded authentication implementation from the
canonical web application, make the public API contract match the production
router, and make clean-database integration verification deterministic. The
cleanup must not weaken tenant/company isolation, exact permissions,
maker-checker, separation of duties, last-administrator protection,
idempotency, or audit evidence.

## 2. Current state

Production already uses:

- `TenantAuthenticationService` and `TenantSessionService`;
- `createTenantAuthRouter` at `/api/v1/auth`;
- PostgreSQL-backed accounts and credentials;
- Redis-backed opaque sessions;
- the source-ledger migration chain, whose security migration 0005 normalizes
  active permission assurance to `password`.

The following surfaces are dormant or inconsistent with production:

- the excluded legacy API password/MFA router and repositories;
- the excluded web MFA workspace;
- legacy MFA service and session implementation exports;
- legacy OpenAPI/client generation files that advertise unmounted MFA routes;
- tests that call `/api/v1/auth/login/password` and MFA endpoints that
  production intentionally returns as not found;
- production-backed C4 integration tests that assume a pre-seeded Demo tenant
  instead of creating deterministic disposable fixtures.

## 3. Considered approaches

### A. Remove only runtime/public dead code and retain historical persistence

This is the selected approach. Remove dormant routers, services, client
methods, excluded UI, and obsolete tests. Preserve already-applied migration
history and historical MFA columns/tables. Use the active source migration
chain and deterministic synthetic test fixtures.

Benefits: one production authentication path, accurate public contracts,
reproducible CI, and no destructive database work.

### B. Delete all MFA database objects and rewrite migration history

Rejected. This would be destructive, would break migration identity and
existing databases, and is unnecessary because historical schema does not
activate MFA.

### C. Keep excluded MFA files and omit failing tests from CI

Rejected. This preserves two apparent authentication architectures, leaves
misleading contracts, and hides rather than resolves clean-database test gaps.

## 4. Implementation boundary

### Remove

- Legacy API authentication/MFA router and repository files that have no
  production imports.
- Legacy MFA domain/service exports that are used only by the removed path.
- The excluded web MFA workspace and its stylesheet.
- Legacy MFA OpenAPI operations, schemas, and generated client methods.
- Obsolete integration/unit tests whose expected routes are intentionally not
  part of the approved architecture.
- TypeScript exclusions that existed solely to hide the obsolete files.

### Preserve

- `tenant-router.ts`, `source-repository.ts`, Redis throttle/session stores,
  secure-cookie helpers, and production API composition.
- Password hashing and compatibility upgrade behavior.
- Normalized authorization repositories and all security administration APIs.
- Historical PostgreSQL migration files, migration ledger identities, MFA
  columns/tables, and existing records.
- Security migration 0005, which makes password assurance authoritative in the
  current production migration chain.
- Existing authorization compatibility safeguards until their separately
  approved retirement.

## 5. Integration-test design

Local and CI PostgreSQL verification uses two disposable databases:

- `nexora_test` for retained legacy compatibility tests;
- `nexora_source_test` for the authoritative source-ledger migration, worker,
  password/session, and governed authorization tests.

A test-only fixture helper will create the approved synthetic tenant,
identities, least-privilege roles, assignments, delegation ceilings, and
source-state constraints inside `nexora_source_test`. It will use the reviewed
R06 UAT manifest, deterministic non-production credentials, and explicit
cleanup. It will not read or mutate Demo.

Production-backed authentication tests will prove login, generic credential
failure, password-hash compatibility upgrade, opaque sessions, fixation
prevention, CSRF, expiry, revocation, logout, refresh persistence, and direct
denial of removed MFA routes. Authorization tests will continue to prove
maker-checker, SoD, tenant isolation, idempotency, last-administrator
protection, and audit evidence.

## 6. Public contract

The authoritative OpenAPI document and generated web client will expose only:

- password login;
- session read/rotation;
- logout and logout-all;
- existing security administration endpoints.

No MFA enrollment, verification, recovery, reset, OIDC, or SAML operation will
remain in the generated production contract. Removed endpoints must continue
to return 404.

## 7. Safety and rollback

- No database migration will be deleted or rewritten.
- No production or Demo record will be changed.
- Removed source remains recoverable from the checksummed archive at
  `E:\Nexora-Archives\2026-10-10\prototype-root-promotion-reference`.
- Changes will be applied in small patches and verified before further cleanup.
- A failing build, contract drift check, security test, PostgreSQL integration
  test, or production route assertion stops the cleanup.
- No commit will be created without separate explicit approval.

## 8. Acceptance criteria

1. Exactly one production authentication router and service path remains.
2. Email/password login and opaque Redis sessions remain functional.
3. Production OpenAPI and generated clients contain no MFA operations.
4. Removed MFA endpoints return 404.
5. A clean PostgreSQL test environment runs source migrations and production
   authentication/authorization integration tests without Demo dependencies.
6. All required build, format, lint, unit, contract, security, integration,
   performance, OpenAPI drift, and production dependency audit checks pass.
7. Existing authorization controls and historical database state remain
   unchanged.
